/**
 * Dedicated Staff Management & Predictive Duty Assignment Service for Pool Orchestrator.
 * Enables facility managers to roster multiple available lifeguards & deck staff according to
 * predicted swimmer loads, with interactive WhatsApp duty alerts (Accept / Reject with reason),
 * automated status confirmation tracking, and shift cancellation notifications.
 */

const db = require('./poolOrchestratorDatabase');
const { defaultSettingsService } = require('./poolOrchestratorSettingsService');

const DEFAULT_STAFF = [
  {
    name: 'Kamal Perera',
    role: 'Senior Lifeguard',
    phone: '+94771234567',
    status: 'available',
  },
  {
    name: 'Saman Kumara',
    role: 'Lifeguard',
    phone: '+94765790015',
    status: 'available',
  },
  {
    name: 'Nimal Fernando',
    role: 'Deck Operations & Water Quality',
    phone: '+94712345678',
    status: 'available',
  },
  {
    name: 'Dinesh Silva',
    role: 'Pool Plant & Maintenance',
    phone: '+94781234567',
    status: 'available',
  },
];

class PoolOrchestratorStaffService {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * Initializes staff and task assignment tables in PostgreSQL
   */
  async ensureTables() {
    if (this.isInitialized) return;

    try {
      // 1. Staff roster table
      await db.query(`
        CREATE TABLE IF NOT EXISTS public.facility_staff (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          role VARCHAR(60) NOT NULL,
          phone VARCHAR(30) NOT NULL,
          status VARCHAR(20) DEFAULT 'available',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // 2. Staff duty assignment audit table
      await db.query(`
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
          status VARCHAR(30) DEFAULT 'pending_confirmation',
          rejection_reason TEXT,
          cancellation_reason TEXT,
          confirmed_at TIMESTAMPTZ,
          cancelled_at TIMESTAMPTZ,
          whatsapp_status VARCHAR(30) DEFAULT 'sent',
          whatsapp_message_id VARCHAR(100),
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Ensure new columns exist if table was created previously
      const schemaAlters = [
        "ALTER TABLE public.staff_assignments ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending_confirmation'",
        "ALTER TABLE public.staff_assignments ADD COLUMN IF NOT EXISTS rejection_reason TEXT",
        "ALTER TABLE public.staff_assignments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT",
        "ALTER TABLE public.staff_assignments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ",
        "ALTER TABLE public.staff_assignments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ",
      ];
      for (const alterQuery of schemaAlters) {
        await db.query(alterQuery).catch(() => {});
      }

      // Seed default staff if table is empty
      const countRes = await db.query('SELECT COUNT(*) AS count FROM public.facility_staff');
      if (parseInt(countRes.rows[0]?.count || '0', 10) === 0) {
        for (const s of DEFAULT_STAFF) {
          await db.query(
            `INSERT INTO public.facility_staff (name, role, phone, status)
             VALUES ($1, $2, $3, $4)`,
            [s.name, s.role, s.phone, s.status]
          );
        }
        console.log('[PoolOrchestratorStaffService] Seeded default facility staff roster.');
      }

      this.isInitialized = true;
    } catch (err) {
      console.warn('[PoolOrchestratorStaffService] Table setup notice:', err.message);
    }
  }

  /**
   * Returns all registered facility staff
   */
  async getStaffMembers() {
    await this.ensureTables();
    try {
      const res = await db.query(
        'SELECT id, name, role, phone, status, created_at FROM public.facility_staff ORDER BY role ASC, name ASC'
      );
      return res.rows;
    } catch (err) {
      console.warn('[PoolOrchestratorStaffService] Failed to query staff, using memory defaults:', err.message);
      return DEFAULT_STAFF.map((s, idx) => ({ id: idx + 1, ...s }));
    }
  }

  /**
   * Adds a new staff member to the facility roster
   */
  async addStaffMember({ name, role, phone, status = 'available' }) {
    await this.ensureTables();
    if (!name || !phone) {
      throw new Error('Staff name and WhatsApp phone number are required.');
    }

    const cleanPhone = String(phone).trim();
    const cleanName = String(name).trim();
    const cleanRole = String(role || 'Lifeguard').trim();

    const res = await db.query(
      `INSERT INTO public.facility_staff (name, role, phone, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [cleanName, cleanRole, cleanPhone, status]
    );

    return res.rows[0];
  }

  /**
   * Updates an existing staff member in the facility roster
   */
  async updateStaffMember(id, { name, role, phone, status = 'available' }) {
    await this.ensureTables();
    if (!name || !phone) {
      throw new Error('Staff name and WhatsApp phone number are required.');
    }

    const cleanPhone = String(phone).trim();
    const cleanName = String(name).trim();
    const cleanRole = String(role || 'Lifeguard').trim();

    const res = await db.query(
      `UPDATE public.facility_staff
       SET name = $1, role = $2, phone = $3, status = $4
       WHERE id = $5
       RETURNING *`,
      [cleanName, cleanRole, cleanPhone, status, id]
    );

    if (res.rows.length === 0) {
      throw new Error(`Staff member with ID ${id} not found.`);
    }

    return res.rows[0];
  }

  /**
   * Deletes a staff member from the facility roster
   */
  async deleteStaffMember(id) {
    await this.ensureTables();
    await db.query('DELETE FROM public.facility_staff WHERE id = $1', [id]);
    return { success: true, deletedId: id };
  }

  /**
   * Returns active and recent shift assignment audit records
   */
  async getAssignments(limit = 50) {
    await this.ensureTables();
    try {
      const res = await db.query(
        `SELECT * FROM public.staff_assignments
         WHERE status != 'cancelled' OR created_at >= NOW() - INTERVAL '24 hours'
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );
      return res.rows;
    } catch (err) {
      console.warn('[PoolOrchestratorStaffService] Failed to fetch assignments:', err.message);
      return [];
    }
  }

  /**
   * Assigns one or MULTIPLE staff members to an operational slot/task
   * and dispatches interactive WhatsApp notifications with Accept/Reject options
   */
  async assignStaff({
    staffIds = [], // Array of IDs for multi-staff selection
    staffId,       // Legacy single ID
    staffName,
    staffPhone,
    taskTitle,
    taskCategory = 'Lifeguard Duty',
    timeSlot,
    slotDate,
    expectedSwimmers = 0,
    demandLevel = 'Moderate',
    operationalNotes = '',
    sendWhatsApp = true,
  }) {
    await this.ensureTables();

    // 1. Gather target staff list (supporting multi-select)
    const targetStaffIds = Array.isArray(staffIds) && staffIds.length > 0
      ? staffIds
      : staffId ? [staffId] : [];

    let targets = [];

    if (targetStaffIds.length > 0) {
      try {
        const staffRes = await db.query(
          'SELECT id, name, role, phone FROM public.facility_staff WHERE id = ANY($1)',
          [targetStaffIds]
        );
        targets = staffRes.rows;
      } catch (err) {
        console.warn('[PoolOrchestratorStaffService] Could not lookup staff list:', err.message);
      }
    }

    // Direct single manual entry fallback
    if (targets.length === 0 && staffName && staffPhone) {
      targets.push({ id: null, name: staffName, phone: staffPhone, role: 'Staff' });
    }

    if (targets.length === 0) {
      throw new Error('Please select at least one staff member with a valid WhatsApp phone number.');
    }

    if (!taskTitle || !timeSlot) {
      throw new Error('Task title and time slot are required for duty assignment.');
    }

    const todayStr = slotDate || new Date().toISOString().split('T')[0];
    const settings = await defaultSettingsService.getSettings().catch(() => ({ pool_name: 'Colombo Aquatic Centre Main Pool' }));
    const poolName = settings.pool_name || 'Colombo Aquatic Centre Main Pool';

    const createdAssignments = [];
    const { defaultWhatsAppService } = require('./poolOrchestratorWhatsAppService');

    // 2. Process and dispatch notification to each assigned staff member
    for (const member of targets) {
      const cleanPhone = String(member.phone).trim();
      const memberName = member.name;

      // Format interactive WhatsApp duty alert message with ACCEPT / REJECT guidance
      const waMessageBody =
        `🏊 *${poolName} — Duty Assignment Request*\n\n` +
        `Hello *${memberName}*,\n` +
        `You have been scheduled for an operational duty shift by the facility manager:\n\n` +
        `• 📋 *Duty / Task:* *${taskTitle}*\n` +
        `• 🏷️ *Category:* ${taskCategory}\n` +
        `• 📅 *Date:* *${todayStr}*\n` +
        `• 🕒 *Time Slot:* *${timeSlot}*\n` +
        `• 👥 *Predicted Bather Load:* ~*${expectedSwimmers} Swimmers* (${demandLevel} Demand)\n` +
        (operationalNotes ? `• ℹ️ *Operational Note:* ${operationalNotes}\n\n` : '\n') +
        `─────────────────────────\n` +
        `👉 *Please reply to this message to submit your decision:*\n` +
        `1️⃣ Reply *ACCEPT* (or *1*) to confirm attendance.\n` +
        `2️⃣ Reply *REJECT [Reason]* (or *2 [Reason]*) to decline (e.g., "REJECT Medical appointment").`;

      let waStatus = 'skipped';
      let waMessageId = null;
      let waError = null;

      if (sendWhatsApp) {
        try {
          const dispatchRes = await defaultWhatsAppService.sendMessage(cleanPhone, waMessageBody, 'manager');
          waStatus = 'sent';
          waMessageId = dispatchRes?.messages?.[0]?.id || `wa_${Date.now()}`;
          console.log(`[PoolOrchestratorStaffService] WhatsApp duty alert dispatched to ${memberName} (${cleanPhone})`);
        } catch (waErr) {
          console.warn(`[PoolOrchestratorStaffService] Meta API notice for ${cleanPhone}:`, waErr.message);
          waStatus = 'simulated';
          waMessageId = `sim_${Date.now()}`;
          waError = waErr.message;
        }
      }

      // Save assignment record with 'pending_confirmation' status
      try {
        const insertRes = await db.query(
          `INSERT INTO public.staff_assignments
            (staff_id, staff_name, staff_phone, task_title, task_category, time_slot,
             slot_date, expected_swimmers, demand_level, operational_notes,
             assigned_by, status, whatsapp_status, whatsapp_message_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending_confirmation', $12, $13, NOW())
           RETURNING *`,
          [
            member.id,
            memberName,
            cleanPhone,
            taskTitle,
            taskCategory,
            timeSlot,
            todayStr,
            expectedSwimmers,
            demandLevel,
            operationalNotes,
            'Facility Manager',
            waStatus,
            waMessageId,
          ]
        );
        createdAssignments.push(insertRes.rows[0]);
      } catch (insertErr) {
        console.warn('[PoolOrchestratorStaffService] Could not record assignment to DB:', insertErr.message);
        createdAssignments.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          staff_id: member.id,
          staff_name: memberName,
          staff_phone: cleanPhone,
          task_title: taskTitle,
          time_slot: timeSlot,
          status: 'pending_confirmation',
          whatsapp_status: waStatus,
        });
      }
    }

    return {
      success: true,
      count: createdAssignments.length,
      assignments: createdAssignments,
      assignment: createdAssignments[0], // for backward compatibility
      whatsappStatus: createdAssignments[0]?.whatsapp_status || 'sent',
    };
  }

  /**
   * Cancels an existing shift assignment and dispatches cancellation WhatsApp to staff
   */
  async cancelAssignment(assignmentId, cancellationReason = 'Duty schedule adjustment') {
    await this.ensureTables();

    // 1. Fetch assignment details
    const assignRes = await db.query('SELECT * FROM public.staff_assignments WHERE id = $1', [assignmentId]);
    if (assignRes.rows.length === 0) {
      throw new Error(`Assignment with ID ${assignmentId} not found.`);
    }

    const assignment = assignRes.rows[0];
    const settings = await defaultSettingsService.getSettings().catch(() => ({ pool_name: 'Colombo Aquatic Centre Main Pool' }));
    const poolName = settings.pool_name || 'Colombo Aquatic Centre Main Pool';

    // 2. Format cancellation WhatsApp message
    const cancelBody =
      `⚠️ *${poolName} — Shift Cancellation Notice*\n\n` +
      `Hello *${assignment.staff_name}*,\n` +
      `Your scheduled operational duty assignment has been *CANCELLED* by the facility manager:\n\n` +
      `• 📋 *Duty / Task:* *${assignment.task_title}*\n` +
      `• 📅 *Date:* *${assignment.slot_date}*\n` +
      `• 🕒 *Time Slot:* *${assignment.time_slot}*\n` +
      `• ⚠️ *Cancellation Reason:* ${cancellationReason}\n\n` +
      `📍 You are no longer required to report for this shift. Thank you!`;

    // 3. Dispatch cancellation alert via WhatsApp
    const { defaultWhatsAppService } = require('./poolOrchestratorWhatsAppService');
    try {
      await defaultWhatsAppService.sendMessage(assignment.staff_phone, cancelBody, 'manager');
      console.log(`[PoolOrchestratorStaffService] Dispatched cancellation WhatsApp to ${assignment.staff_phone}`);
    } catch (waErr) {
      console.warn(`[PoolOrchestratorStaffService] Could not send cancellation WhatsApp:`, waErr.message);
    }

    // 4. Update database status to 'cancelled'
    const updateRes = await db.query(
      `UPDATE public.staff_assignments
       SET status = 'cancelled',
           cancellation_reason = $1,
           cancelled_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [cancellationReason, assignmentId]
    );

    return {
      success: true,
      assignment: updateRes.rows[0],
      message: `Shift duty assignment cancelled and notification sent to ${assignment.staff_name}.`,
    };
  }

  /**
   * Manually confirms an assignment (e.g. from manager dashboard)
   */
  async confirmAssignment(assignmentId) {
    await this.ensureTables();
    const res = await db.query(
      `UPDATE public.staff_assignments
       SET status = 'confirmed', confirmed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [assignmentId]
    );
    return { success: true, assignment: res.rows[0] };
  }

  /**
   * Manually rejects an assignment (e.g. from manager dashboard)
   */
  async rejectAssignment(assignmentId, rejectionReason = 'Declined by staff') {
    await this.ensureTables();
    const res = await db.query(
      `UPDATE public.staff_assignments
       SET status = 'rejected', rejection_reason = $1
       WHERE id = $2
       RETURNING *`,
      [rejectionReason, assignmentId]
    );
    return { success: true, assignment: res.rows[0] };
  }

  /**
   * Checks if an incoming WhatsApp message is an ACCEPT or REJECT reply from a staff member
   * @param {string} fromPhone Recipient phone string from webhook
   * @param {string} messageText Text received
   */
  async checkAndHandleStaffReply(fromPhone, messageText = '') {
    if (!messageText || !fromPhone) return { handled: false };

    await this.ensureTables();
    const cleanPhoneDigits = String(fromPhone).replace(/[^0-9]/g, '');
    const cleanText = messageText.trim().toLowerCase();

    // Check if there is an active pending assignment for this phone number
    let assignment = null;
    try {
      const res = await db.query(
        `SELECT * FROM public.staff_assignments
         WHERE status = 'pending_confirmation'
           AND regexp_replace(staff_phone, '[^0-9]', '', 'g') = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [cleanPhoneDigits]
      );
      if (res.rows.length > 0) {
        assignment = res.rows[0];
      }
    } catch (err) {
      console.warn('[PoolOrchestratorStaffService] Pending check notice:', err.message);
    }

    if (!assignment) {
      return { handled: false };
    }

    // 1. Check for ACCEPT
    const isAccept =
      cleanText === '1' ||
      cleanText === 'accept' ||
      cleanText === 'confirm' ||
      cleanText === 'ack' ||
      cleanText === 'yes' ||
      cleanText === 'ok' ||
      cleanText.startsWith('1 ') ||
      cleanText.startsWith('accept ') ||
      cleanText.startsWith('confirm ');

    if (isAccept) {
      await db.query(
        `UPDATE public.staff_assignments
         SET status = 'confirmed', confirmed_at = NOW()
         WHERE id = $1`,
        [assignment.id]
      );

      console.log(`[PoolOrchestratorStaffService] Shift assignment ${assignment.id} CONFIRMED by ${assignment.staff_name}`);

      return {
        handled: true,
        action: 'confirmed',
        assignmentId: assignment.id,
        replyText:
          `✅ *Duty Confirmed!*\n\n` +
          `Thank you *${assignment.staff_name}*. Your shift for *${assignment.task_title}* at *${assignment.time_slot}* is officially confirmed.\n\n` +
          `Please report on time. Have a safe and productive duty shift!`,
      };
    }

    // 2. Check for REJECT
    const isReject =
      cleanText === '2' ||
      cleanText === 'reject' ||
      cleanText === 'decline' ||
      cleanText === 'no' ||
      cleanText.startsWith('2 ') ||
      cleanText.startsWith('reject ') ||
      cleanText.startsWith('decline ');

    if (isReject) {
      // Extract reason if provided
      let reason = 'Declined via WhatsApp';
      const parts = messageText.trim().split(/\s+/);
      if (parts.length > 1) {
        reason = parts.slice(1).join(' ').trim();
      }

      await db.query(
        `UPDATE public.staff_assignments
         SET status = 'rejected', rejection_reason = $1
         WHERE id = $2`,
        [reason, assignment.id]
      );

      console.log(`[PoolOrchestratorStaffService] Shift assignment ${assignment.id} REJECTED by ${assignment.staff_name}. Reason: ${reason}`);

      return {
        handled: true,
        action: 'rejected',
        assignmentId: assignment.id,
        replyText:
          `❌ *Duty Declined.*\n\n` +
          `Understood *${assignment.staff_name}*. Your shift decline has been registered with the duty manager:\n` +
          `• *Reason:* ${reason}\n\n` +
          `Thank you for notifying us promptly so the shift can be reassigned.`,
      };
    }

    return { handled: false };
  }
}

const defaultStaffService = new PoolOrchestratorStaffService();

module.exports = {
  PoolOrchestratorStaffService,
  defaultStaffService,
};
