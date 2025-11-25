// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaignId } = await req.json();
    
    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: 'Campaign ID is required' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Starting campaign: ${campaignId} (Delegating to batch processor)`);

    // 1. Ensure campaign is marked as sending
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({ 
        status: 'sending',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    if (updateError) {
      console.error('Error updating campaign status:', updateError);
      throw updateError;
    }

    // 2. Trigger the first batch immediately
    // We use invoke to call the robust batch processor
    const { data, error: invokeError } = await supabase.functions.invoke('send-campaign-batch', {
      body: { campaignId, batchSize: 3 }
    });

    if (invokeError) {
      console.error('Error invoking batch function:', invokeError);
      const details = invokeError instanceof Error ? invokeError.message : JSON.stringify(invokeError);
      // If it's a FunctionsHttpError, it might have a context property with the response body
      let bodyDetails = '';
      if ('context' in invokeError && typeof (invokeError as any).context?.json === 'function') {
         try {
            const body = await (invokeError as any).context.json();
            bodyDetails = JSON.stringify(body);
         } catch (e) { /* ignore */ }
      }
      throw new Error(`Batch function failed: ${details} ${bodyDetails}`);
    }

    console.log('First batch triggered successfully:', data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Campaign started successfully. Background monitor will handle remaining emails.',
        data 
      }),
      { 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        } 
      }
    );

  } catch (error) {
    console.error('Error in send-campaign-emails wrapper:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        } 
      }
    );
  }
});