#!/usr/bin/env node
// Sinh bộ khóa MỚI cho một môi trường (dán vào .env.production hoặc biến môi trường Vercel). Chỉ in ra màn hình, không ghi file.
//
//   pnpm env:keys
//
// Mỗi môi trường PHẢI có bộ khóa riêng:
//   • AUTH_JWT_*  : khóa ký phiên đăng nhập — khác nhau thì phiên của staging không dùng được trên production (và ngược lại).
//   • PII_KEY_V1 / PII_BIDX_KEY : khóa mã hóa CCCD, SĐT phụ huynh. ĐỔI KHÓA = dữ liệu đã mã hóa cũ không giải mã được.
//       ⇒ DB production MỚI (không sao chép dữ liệu từ staging): dùng khóa mới. Nếu sao chép DB staging sang production: GIỮ NGUYÊN khóa của staging.
//   • CRON_SECRET : mật khẩu cho Vercel Cron gọi /api/cron/daily.
import { randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair } from "jose";

const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
const kid = randomBytes(6).toString("hex");
const priv = JSON.stringify({ ...(await exportJWK(privateKey)), kid, alg: "EdDSA" });
const pub = JSON.stringify({ ...(await exportJWK(publicKey)), kid, alg: "EdDSA" });

console.log(`# Khóa mới sinh lúc ${new Date().toISOString()} — dán vào file môi trường tương ứng, KHÔNG commit.`);
console.log(`AUTH_JWT_PRIVATE_JWK=${priv}`);
console.log(`AUTH_JWT_PUBLIC_JWK=${pub}`);
console.log(`PII_KEY_V1=${randomBytes(32).toString("base64")}`);
console.log(`PII_BIDX_KEY=${randomBytes(32).toString("base64")}`);
console.log(`CRON_SECRET=${randomBytes(24).toString("base64url")}`);
