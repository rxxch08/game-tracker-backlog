import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS } from "../config/auth.js";

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Compared against when the user does not exist, so that "unknown user" and
// "wrong password" take about the same time (prevents user enumeration by timing).
export const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_ROUNDS);