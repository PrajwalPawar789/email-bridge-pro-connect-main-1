// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleCatalogSearchRequest } from "./handler.ts";

serve(handleCatalogSearchRequest);
