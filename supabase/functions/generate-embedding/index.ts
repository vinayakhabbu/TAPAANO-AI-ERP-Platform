import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { unavailableHandler } from "../_shared/unavailable.ts";

serve(unavailableHandler);
