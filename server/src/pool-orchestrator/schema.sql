-- =============================================================================
-- COMPONENT 04: PREDICTIVE RESOURCE ORCHESTRATOR
-- AUTHORITATIVE DATABASE SCHEMA (POSTGRESQL / SUPABASE)
-- =============================================================================
-- This file defines the complete, structured database schema for Component 04:
--
--  TABLE 1: person_traffic_events
--           Real-time gate sensor telemetry (entry/exit tracking).
--  TABLE 2: hourly_pool_occupancy
--           Aggregated hourly occupancy & ML input features (6 features).
--  TABLE 3: pool_predictions
--           6-hour forward-looking ML model inference predictions.
--  TABLE 4: filtration_events
--           ESP32 4-bulb relay telemetry and manual override actuation events.
--  TABLE 5: pool_orchestrator_settings
--           Dynamic capacity thresholds, staffing ratios, and facility settings.
--  TABLE 6: facility_staff
--           Staff roster (lifeguards, operators, technicians).
--  TABLE 7: staff_assignments
--           Shift duty scheduling & WhatsApp confirmation audit log.
--  TABLE 8: whatsapp_messages
--           Two-way customer & staff WhatsApp interaction records.
--
-- Note: All table creations use CREATE TABLE IF NOT EXISTS and ON CONFLICT DO NOTHING
-- to ensure idempotent execution without losing accumulated training data.
-- =============================================================================

-- =============================================================================
-- OPTIONAL HARD RESET (Uncomment ONLY to wipe and re-create from scratch)
-- =============================================================================
-- DROP TABLE IF EXISTS public.staff_assignments CASCADE;
-- DROP TABLE IF EXISTS public.facility_staff CASCADE;
-- DROP TABLE IF EXISTS public.whatsapp_messages CASCADE;
-- DROP TABLE IF EXISTS public.pool_orchestrator_settings CASCADE;
-- DROP TABLE IF EXISTS public.filtration_events CASCADE;
-- DROP TABLE IF EXISTS public.pool_predictions CASCADE;
-- DROP TABLE IF EXISTS public.hourly_pool_occupancy CASCADE;
-- DROP TABLE IF EXISTS public.person_traffic_events CASCADE;

-- =============================================================================
-- 1. TABLE: person_traffic_events
-- High-frequency entry/exit gate sensor events from ESP32 edge device.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.person_traffic_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('entry', 'exit')),
    occupancy_after INTEGER NOT NULL CHECK (occupancy_after >= 0),
    sensor_id VARCHAR(50) DEFAULT 'esp32-gate-01',
    time_12h VARCHAR(20) NOT NULL,                -- e.g. '1:15 PM' in local time
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_traffic_recorded_at ON public.person_traffic_events (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_event_type ON public.person_traffic_events (event_type);

-- =============================================================================
-- 2. TABLE: hourly_pool_occupancy
-- Ground-truth training dataset aggregated hourly for Random Forest retraining.
-- Features: [hour, day, weekend, holiday, rain, weather]
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.hourly_pool_occupancy (
    id BIGSERIAL PRIMARY KEY,
    target_hour TIMESTAMPTZ NOT NULL UNIQUE,     -- Exact hour start (e.g. '2026-10-15 13:00:00+05:30')
    time_slot VARCHAR(20) NOT NULL,               -- e.g. '1:00 PM', '2:00 PM' (12-hour format)
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    day VARCHAR(15) NOT NULL,                     -- 'Monday', 'Tuesday', ..., 'Sunday'
    weekend INTEGER NOT NULL CHECK (weekend IN (0, 1)),
    holiday INTEGER NOT NULL CHECK (holiday IN (0, 1)),
    rain INTEGER NOT NULL CHECK (rain IN (0, 1)),
    weather VARCHAR(30) NOT NULL,                 -- 'Sunny', 'Rainy', 'Cloudy', etc.
    temperature_c NUMERIC(4, 1),                  -- e.g. 28.5
    occupancy_count INTEGER NOT NULL DEFAULT 0,   -- Average swimmers during hour
    total_entries INTEGER NOT NULL DEFAULT 0,
    total_exits INTEGER NOT NULL DEFAULT 0,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hourly_target_hour ON public.hourly_pool_occupancy (target_hour DESC);

-- =============================================================================
-- 3. TABLE: pool_predictions
-- 6-hour forward-looking ML model inference predictions.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.pool_predictions (
    id BIGSERIAL PRIMARY KEY,
    target_time TIMESTAMPTZ NOT NULL,
    time_slot VARCHAR(20) NOT NULL,               -- e.g. '7:00 PM', '8:00 PM'
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    day VARCHAR(15) NOT NULL,
    predicted_swimmers NUMERIC(6, 2) NOT NULL,
    demand_level VARCHAR(20) NOT NULL,            -- 'Low', 'Moderate', 'High', 'Very High'
    weather VARCHAR(30) NOT NULL,
    rain INTEGER NOT NULL DEFAULT 0,
    model_version VARCHAR(30) DEFAULT 'v1.0.0',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    input_features JSONB
);

CREATE INDEX IF NOT EXISTS idx_predictions_target_time ON public.pool_predictions (target_time ASC);

-- =============================================================================
-- 4. TABLE: filtration_events
-- Hardware relay state telemetry for ESP32 4-bulb filtration board.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.filtration_events (
    id BIGSERIAL PRIMARY KEY,
    relay_state VARCHAR(50) NOT NULL,             -- e.g. '2 bulbs on', '3 bulbs on'
    active_bulbs INTEGER NOT NULL CHECK (active_bulbs >= 0 AND active_bulbs <= 4),
    relays VARCHAR(20) NOT NULL DEFAULT '1,0,0,0',-- e.g. '1,1,0,0', '1,1,1,0'
    reason TEXT,
    source VARCHAR(30) DEFAULT 'auto_load',       -- 'auto_load' | 'manager_manual' | 'esp32_mqtt'
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_filtration_recorded_at ON public.filtration_events (recorded_at DESC);

-- =============================================================================
-- 5. TABLE: pool_orchestrator_settings
-- Dynamic capacity boundaries, lifeguard ratios, and facility configuration.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.pool_orchestrator_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'current',
    pool_name VARCHAR(100) NOT NULL DEFAULT 'Colombo Aquatic Centre Main Pool',
    low_demand_max INTEGER NOT NULL DEFAULT 15,
    moderate_demand_max INTEGER NOT NULL DEFAULT 30,
    high_demand_max INTEGER NOT NULL DEFAULT 45,
    swimmer_to_lifeguard_ratio INTEGER NOT NULL DEFAULT 20,
    min_lifeguards INTEGER NOT NULL DEFAULT 1,
    min_operational_staff INTEGER NOT NULL DEFAULT 1,
    opening_hour INTEGER NOT NULL DEFAULT 6,
    closing_hour INTEGER NOT NULL DEFAULT 22,
    auto_retrain_interval INTEGER NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 6. TABLE: facility_staff
-- Staff roster containing lifesavers, deck operators, and maintenance technicians.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.facility_staff (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(60) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    status VARCHAR(20) DEFAULT 'available',        -- 'available' | 'on_duty' | 'off_duty'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facility_staff_phone ON public.facility_staff (phone);
CREATE INDEX IF NOT EXISTS idx_facility_staff_status ON public.facility_staff (status);

-- =============================================================================
-- 7. TABLE: staff_assignments
-- Shift scheduling records with interactive WhatsApp dispatch & confirmation.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.staff_assignments (
    id SERIAL PRIMARY KEY,
    staff_id INTEGER REFERENCES public.facility_staff(id) ON DELETE SET NULL,
    staff_name VARCHAR(100) NOT NULL,
    staff_phone VARCHAR(30) NOT NULL,
    task_title VARCHAR(150) NOT NULL,
    task_category VARCHAR(60) DEFAULT 'Lifeguard Duty',
    time_slot VARCHAR(60) NOT NULL,
    slot_date VARCHAR(30) NOT NULL,
    expected_swimmers INTEGER DEFAULT 0,
    demand_level VARCHAR(30) DEFAULT 'Moderate',
    operational_notes TEXT,
    assigned_by VARCHAR(60) DEFAULT 'Facility Manager',
    status VARCHAR(30) DEFAULT 'pending_confirmation', -- 'pending_confirmation' | 'confirmed' | 'rejected' | 'cancelled'
    rejection_reason TEXT,
    cancellation_reason TEXT,
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    whatsapp_status VARCHAR(30) DEFAULT 'sent',        -- 'sent' | 'skipped' | 'failed' | 'simulated'
    whatsapp_message_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_staff_id ON public.staff_assignments (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_status ON public.staff_assignments (status);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_created_at ON public.staff_assignments (created_at DESC);

-- =============================================================================
-- 8. TABLE: whatsapp_messages
-- WhatsApp conversation audit trail for customer queries and staff replies.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id BIGSERIAL PRIMARY KEY,
    wa_message_id VARCHAR(150),
    sender_phone VARCHAR(30) NOT NULL,
    customer_name VARCHAR(100),
    incoming_text TEXT,
    reply_text TEXT,
    status VARCHAR(30) DEFAULT 'replied',
    sender_role VARCHAR(20) DEFAULT 'bot',        -- 'customer' | 'staff' | 'bot' | 'manager'
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON public.whatsapp_messages (sender_phone, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_received_at ON public.whatsapp_messages (received_at DESC);

-- =============================================================================
-- 9. INITIAL BASELINE SEED DATA
-- Inserts default settings and sample roster if tables are empty.
-- =============================================================================

-- Seed default facility settings
INSERT INTO public.pool_orchestrator_settings
  (id, pool_name, low_demand_max, moderate_demand_max, high_demand_max,
   swimmer_to_lifeguard_ratio, min_lifeguards, min_operational_staff,
   opening_hour, closing_hour, auto_retrain_interval, updated_at)
VALUES
  ('current', 'Colombo Aquatic Centre Main Pool', 15, 30, 45, 20, 1, 1, 6, 22, 100, NOW())
ON CONFLICT (id) DO NOTHING;

-- Seed default facility staff roster
INSERT INTO public.facility_staff (name, role, phone, status)
VALUES
  ('Kamal Perera', 'Senior Lifeguard', '+94771234567', 'available'),
  ('Saman Kumara', 'Lifeguard', '+94765790015', 'available'),
  ('Nimal Fernando', 'Deck Operations & Water Quality', '+94712345678', 'available'),
  ('Dinesh Silva', 'Pool Plant & Maintenance', '+94781234567', 'available')
ON CONFLICT (phone) DO NOTHING;

-- Seed initial baseline filtration event if table is empty
INSERT INTO public.filtration_events
  (relay_state, active_bulbs, relays, reason, source, recorded_at)
SELECT
  '2 bulbs on', 2, '1,1,0,0', 'Auto load-based baseline circulation (Moderate Load)', 'auto_load', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.filtration_events LIMIT 1);
