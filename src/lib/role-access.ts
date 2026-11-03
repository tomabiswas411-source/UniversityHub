import type { SessionUser, UserRole } from "@/types";

/**
 * Role-based visibility rules — "each role sees only the parts of the
 * platform it needs" (Role-Loop directive).
 *
 * Single source of truth so header, mobile nav, footer and the pricing
 * view itself all agree. Pure functions, zero cost.
 */

/** Lightweight shape so views can pass the store user directly. */
export type RoleUser = Pick<SessionUser, "role"> | null | undefined;

/**
 * Pricing/subscription is a decision made by universities — visitors
 * (prospective institutions), platform owners (super_admin) and
 * department heads (who run a subscribing department) may see it.
 * Students & teachers never need it.
 */
export function canSeePricing(user: RoleUser): boolean {
  return (
    !user || user.role === "super_admin" || user.role === "dept_admin"
  );
}

/** Staff roles that manage their department inside the dashboard. */
export function isStaffRole(role: UserRole | string | undefined): boolean {
  return role === "super_admin" || role === "dept_admin" || role === "teacher";
}
