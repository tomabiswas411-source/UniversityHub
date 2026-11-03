import { NextResponse } from "next/server";
import { ApiError } from "@/lib/session";

/** Standard JSON success response */
export function ok<T>(data: T, init?: number) {
 return NextResponse.json({ success: true, data }, { status: init ?? 200 });
}

/** Wrap a route handler: converts ApiError & unexpected errors to JSON */
export async function handle<T>(fn: () => Promise<T>) {
 try {
 const data = await fn();
 return ok(data);
 } catch (err) {
 if (err instanceof ApiError) {
 return NextResponse.json(
 { success: false, error: err.message },
 { status: err.status }
 );
 }
 console.error("[api] unexpected error:", err);
 const message =
 err instanceof Error ? err.message : "Internal server error";
 return NextResponse.json(
 { success: false, error: message },
 { status: 500 }
 );
 }
}

export function badRequest(message: string) {
 return NextResponse.json({ success: false, error: message }, { status: 400 });
}
