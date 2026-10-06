import pg from "pg";
import { hash, Algorithm } from "@node-rs/argon2";

const DEMO_PASSWORD = "LuuXa@2026";

// Chuỗi kết nối chủ DB KHÔNG viết cứng trong mã: truyền --url=… hoặc đặt biến môi trường MIGRATE_DATABASE_URL.
const url = process.argv.slice(2).find((a) => a.startsWith("--url="))?.slice(6) || process.env.MIGRATE_DATABASE_URL;
if (!url) {
  console.error("✗ Thiếu --url=postgresql://… hoặc biến MIGRATE_DATABASE_URL.");
  process.exit(2);
}

async function run() {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Connected to database:", url.replace(/:[^:]*@/, ":***@"));

  const pwHash = await hash(DEMO_PASSWORD, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await client.query("BEGIN");

  try {
    // 1. Reset passwords and unlock all existing users
    await client.query(`
      UPDATE users
      SET password_hash = $1,
          status = 'active',
          locked_until = NULL,
          must_change_password = false
      WHERE status <> 'disabled'
    `, [pwHash]);
    console.log("Updated password hashes and unlocked existing users.");

    // 2. Clear failed login attempts
    await client.query(`DELETE FROM login_attempts`);
    console.log("Cleared login_attempts.");

    // 3. Ensure admin@luuxa.local exists
    const adminCheck = await client.query("SELECT id FROM users WHERE email = 'admin@luuxa.local'");
    let adminUserId;
    if (adminCheck.rows.length === 0) {
      const res = await client.query(`
        INSERT INTO users (email, phone_e164, password_hash, password_changed_at, status, email_verified_at)
        VALUES ('admin@luuxa.local', '+84900000001', $1, now(), 'active', now())
        RETURNING id
      `, [pwHash]);
      adminUserId = res.rows[0].id;
      console.log("Created user admin@luuxa.local:", adminUserId);

      // Create member
      const memRes = await client.query(`
        INSERT INTO members (user_id, full_name, display_name, gender, contact_phone_e164, contact_email, joined_on, created_by)
        VALUES ($1, 'Quản Trị Viên Hệ Thống', 'Admin', 'male', '+84900000001', 'admin@luuxa.local', '2025-09-01', $1)
        RETURNING id
      `, [adminUserId]);
      const adminMemberId = memRes.rows[0].id;
      console.log("Created member for admin@luuxa.local:", adminMemberId);

      // Consents
      for (const code of ["terms_of_use", "privacy_notice_ack", "catholic_profile", "catholic_share_leadership", "academic_share_leadership", "photo_tagging"]) {
        await client.query(`
          INSERT INTO consents (member_id, purpose_code, policy_version, method, evidence_note, recorded_by)
          VALUES ($1, $2, 1, 'paper', 'Khởi tạo tài khoản quản trị', $3)
          ON CONFLICT DO NOTHING
        `, [adminMemberId, code, adminUserId]);
      }

      // Assign admin and member roles
      await client.query(`
        INSERT INTO user_roles (user_id, role_id, note)
        SELECT $1, r.id, 'Tài khoản quản trị viên hệ thống'
        FROM roles r
        WHERE r.code IN ('admin', 'member')
        ON CONFLICT DO NOTHING
      `, [adminUserId]);
      console.log("Assigned admin & member roles to admin@luuxa.local.");
    } else {
      adminUserId = adminCheck.rows[0].id;
      await client.query(`
        UPDATE users
        SET password_hash = $1, status = 'active', locked_until = NULL, must_change_password = false
        WHERE id = $2
      `, [pwHash, adminUserId]);
      console.log("admin@luuxa.local already exists, updated password.");
    }

    await client.query("COMMIT");
    console.log("Transaction committed successfully!");

    // List test accounts
    const testAccounts = await client.query(`
      SELECT u.email, m.full_name, m.display_name, array_agg(r.code) as roles
      FROM users u
      LEFT JOIN members m ON m.user_id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.email IN (
        'admin@luuxa.local',
        'viet.vu@luuxa.local',
        'duc.tran@luuxa.local',
        'bao.pham@luuxa.local',
        'phong.dang@luuxa.local',
        'khoi.hoang@luuxa.local',
        'khoa.ngo@luuxa.local',
        'tuan.nguyen@luuxa.local'
      )
      GROUP BY u.email, m.full_name, m.display_name
      ORDER BY u.email
    `);

    console.log("\n=== TEST ACCOUNTS SUMMARY ===");
    for (const row of testAccounts.rows) {
      console.log(`- Email: ${row.email.padEnd(25)} | Name: ${(row.full_name || "").padEnd(25)} | Roles: ${row.roles?.join(", ")}`);
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error ensuring test accounts:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
