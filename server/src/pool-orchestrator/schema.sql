-- =============================================================================
-- POOL ORCHESTRATOR - PRODUCTION DATABASE SCHEMA (POSTGRESQL / SUPABASE)
-- =============================================================================
-- This script performs a clean reset by dropping previous tables and creating
-- only the required tables for:
--  1. Real-time person-by-person entry/exit tracking
--  2. Hourly aggregated occupancy & ML training features (1:00 PM, 2:00 PM format)
--  3. ML 6-hour future demand predictions
--  4. 4-Bulb filtration relay board actuation telemetry
-- =============================================================================

-- =============================================================================
-- 1. DROP PREVIOUS TABLES & VIEWS (Clean Reset)
-- =============================================================================
DROP VIEW IF EXISTS public.predictions CASCADE;
DROP TABLE IF EXISTS public.sensor_readings CASCADE;
DROP TABLE IF EXISTS public.occupancy_history CASCADE;
DROP TABLE IF EXISTS public.pool_orchestrator_events CASCADE;
DROP TABLE IF EXISTS public.pool_orchestrator_hourly_history CASCADE;
DROP TABLE IF EXISTS public.pool_orchestrator_predictions CASCADE;
DROP TABLE IF EXISTS public.person_traffic_events CASCADE;
DROP TABLE IF EXISTS public.hourly_pool_occupancy CASCADE;
DROP TABLE IF EXISTS public.pool_predictions CASCADE;
DROP TABLE IF EXISTS public.filtration_events CASCADE;

-- =============================================================================
-- 2. TABLE 1: person_traffic_events
-- Saves every single entry and exit when a person passes the sensor gate.
-- Exactly 1 record per person movement, with timestamp and resulting occupancy.
-- =============================================================================
CREATE TABLE public.person_traffic_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('entry', 'exit')),
    occupancy_after INTEGER NOT NULL CHECK (occupancy_after >= 0),
    sensor_id VARCHAR(50) DEFAULT 'esp32-gate-01',
    time_12h VARCHAR(20) NOT NULL,                -- e.g. '1:15 PM' in local time
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_payload JSONB
);

CREATE INDEX idx_traffic_recorded_at ON public.person_traffic_events (recorded_at DESC);
CREATE INDEX idx_traffic_event_type ON public.person_traffic_events (event_type);

-- =============================================================================
-- 3. TABLE 2: hourly_pool_occupancy
-- Aggregated hourly occupancy and features formatted at hour marks (1:00 PM, 2:00 PM).
-- Contains the exact 6 features required for ML model training and future predictions:
-- [hour, day, weekend, holiday, rain, weather]
-- =============================================================================
CREATE TABLE public.hourly_pool_occupancy (
    id BIGSERIAL PRIMARY KEY,
    target_hour TIMESTAMPTZ NOT NULL UNIQUE,     -- Exact hour start (e.g. '2026-10-15 13:00:00+05:30')
    time_slot VARCHAR(20) NOT NULL,               -- e.g. '1:00 PM', '2:00 PM' (12-hour format)
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),  -- 0 to 23
    day VARCHAR(15) NOT NULL,                     -- 'Monday', 'Tuesday', ..., 'Sunday'
    weekend INTEGER NOT NULL CHECK (weekend IN (0, 1)),      -- 1 = Weekend, 0 = Weekday
    holiday INTEGER NOT NULL CHECK (holiday IN (0, 1)),      -- 1 = Public Holiday, 0 = Regular Day
    rain INTEGER NOT NULL CHECK (rain IN (0, 1)),            -- 1 = Rain detected, 0 = Dry
    weather VARCHAR(30) NOT NULL,                 -- 'Sunny', 'Rainy', 'Cloudy', etc.
    temperature_c NUMERIC(4, 1),                  -- Temperature in Celsius (e.g. 28.5)
    occupancy_count INTEGER NOT NULL DEFAULT 0,   -- Swimmers in the pool during that hour
    total_entries INTEGER NOT NULL DEFAULT 0,     -- Total entries counted in this hour
    total_exits INTEGER NOT NULL DEFAULT 0,       -- Total exits counted in this hour
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hourly_target_hour ON public.hourly_pool_occupancy (target_hour DESC);

-- =============================================================================
-- 4. TABLE 3: pool_predictions
-- Stores 6-hour forward-looking ML model predictions for display on the
-- dashboard forecast chart and operational resource plan.
-- =============================================================================
CREATE TABLE public.pool_predictions (
    id BIGSERIAL PRIMARY KEY,
    target_time TIMESTAMPTZ NOT NULL,             -- Future hour timestamp
    time_slot VARCHAR(20) NOT NULL,               -- e.g. '7:00 PM', '8:00 PM'
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    day VARCHAR(15) NOT NULL,
    predicted_swimmers NUMERIC(6, 2) NOT NULL,    -- Forecast swimmer count
    demand_level VARCHAR(20) NOT NULL,            -- 'Low', 'Moderate', 'High', 'Very High'
    weather VARCHAR(30) NOT NULL,
    rain INTEGER NOT NULL DEFAULT 0,
    model_version VARCHAR(30) DEFAULT 'v1.0.0',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    input_features JSONB
);

CREATE INDEX idx_predictions_target_time ON public.pool_predictions (target_time ASC);

-- =============================================================================
-- 5. TABLE 4: filtration_events
-- Hardware telemetry and relay state logging for ESP32 4-bulb relay board.
-- =============================================================================
CREATE TABLE public.filtration_events (
    id BIGSERIAL PRIMARY KEY,
    relay_state VARCHAR(50) NOT NULL,             -- e.g. '2 bulbs on'
    active_bulbs INTEGER NOT NULL CHECK (active_bulbs >= 0 AND active_bulbs <= 4),
    relays VARCHAR(20) NOT NULL DEFAULT '1,0,0,0',-- e.g. '1,1,0,0'
    reason TEXT,
    source VARCHAR(30) DEFAULT 'auto_load',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_filtration_recorded_at ON public.filtration_events (recorded_at DESC);

-- =============================================================================
-- 6. INITIAL BASELINE DATA
-- Inserts initial baseline state so the dashboard operates immediately upon setup.
-- =============================================================================
INSERT INTO public.person_traffic_events 
  (event_type, occupancy_after, sensor_id, time_12h, hour, recorded_at)
VALUES 
  ('entry', 20, 'esp32-gate-01', TO_CHAR(NOW() AT TIME ZONE 'Asia/Colombo', 'HH12:MI AM'), EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Colombo'), NOW());

INSERT INTO public.hourly_pool_occupancy 
  (target_hour, time_slot, hour, day, weekend, holiday, rain, weather, temperature_c, occupancy_count, total_entries, total_exits, recorded_at)
VALUES (
  date_trunc('hour', NOW() AT TIME ZONE 'Asia/Colombo') AT TIME ZONE 'Asia/Colombo',
  TO_CHAR(date_trunc('hour', NOW() AT TIME ZONE 'Asia/Colombo'), 'HH12:00 AM'),
  EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Colombo'),
  TRIM(TO_CHAR(NOW() AT TIME ZONE 'Asia/Colombo', 'Day')),
  CASE WHEN EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'Asia/Colombo') IN (6, 7) THEN 1 ELSE 0 END,
  0,
  0,
  'Sunny',
  28.0,
  20,
  20,
  0,
  NOW()
) ON CONFLICT (target_hour) DO NOTHING;

INSERT INTO public.filtration_events 
  (relay_state, active_bulbs, relays, reason, source, recorded_at)
VALUES 
  ('2 bulbs on', 2, '1,1,0,0', 'Auto load-based baseline circulation for 20 swimmers (Moderate Load)', 'auto_load', NOW());
