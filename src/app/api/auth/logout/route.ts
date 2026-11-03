import { handle } from "@/lib/api-helpers";
import { clearSession } from "@/lib/session";

export async function POST() {
 return handle(async () => {
 await clearSession();
 return { loggedOut: true };
 });
}
