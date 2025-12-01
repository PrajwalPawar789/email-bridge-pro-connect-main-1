/// <reference path="../types.d.ts" />
// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts"

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let body;
    try {
      const text = await req.text();
      if (!text) {
        throw new Error("Empty request body");
      }
      body = JSON.parse(text);
    } catch (e: any) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body', details: e.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }
    
    const { domain } = body;

    if (!domain) {
      return new Response(
        JSON.stringify({ error: 'Domain is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 1. Get Service Account from Secrets
    const serviceAccountStr = Deno.env.get('GOOGLE_SERVICE_ACCOUNT')
    if (!serviceAccountStr) {
      console.error('GOOGLE_SERVICE_ACCOUNT secret is missing')
      return new Response(
        JSON.stringify({ 
          error: 'Configuration Error', 
          message: 'Google Service Account not configured on server.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const serviceAccount = JSON.parse(serviceAccountStr)
    console.log('Service Account loaded:', serviceAccount.client_email);
    
    // FIX: Ensure private key has correct newlines for PEM format
    const privateKeyStr = serviceAccount.private_key.includes('\\n') 
      ? serviceAccount.private_key.replace(/\\n/g, '\n') 
      : serviceAccount.private_key;

    const privateKey = await importPrivateKey(privateKeyStr);

    // 2. Create JWT for Google Auth
    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + 3600 // 1 hour

    console.log('Creating JWT...');
    try {
        const jwt = await create(
        { alg: "RS256", typ: "JWT" },
        {
            iss: serviceAccount.client_email,
            scope: "https://www.googleapis.com/auth/postmaster.readonly",
            aud: "https://oauth2.googleapis.com/token",
            exp,
            iat,
        },
        privateKey
        )
        console.log('JWT created successfully');
        
        // 3. Exchange JWT for Access Token
        console.log('Exchanging JWT for Access Token...');
        const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
        })

        const tokenData = await tokenResp.json()
        if (!tokenData.access_token) {
            console.error('Token Error:', tokenData);
            throw new Error('Failed to get Google Access Token: ' + JSON.stringify(tokenData))
        }
        console.log('Access Token received');

        // 4. Fetch Traffic Stats from Postmaster Tools API
        // Date range: Last 30 days
        const endDate = new Date()
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - 30)

        const formattedStartDate = startDate.toISOString().split('T')[0].replace(/-/g, '')
        const formattedEndDate = endDate.toISOString().split('T')[0].replace(/-/g, '')

        const apiUrl = `https://gmailpostmastertools.googleapis.com/v1beta1/domains/${domain}/trafficStats?startDate.year=${startDate.getFullYear()}&startDate.month=${startDate.getMonth() + 1}&startDate.day=${startDate.getDate()}&endDate.year=${endDate.getFullYear()}&endDate.month=${endDate.getMonth() + 1}&endDate.day=${endDate.getDate()}`

        console.log('Fetching stats from:', apiUrl);
        const statsResp = await fetch(apiUrl, {
        headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
        },
        })

        if (!statsResp.ok) {
        const errorText = await statsResp.text()
        console.error('Postmaster API Error:', errorText)
        // If 404 or 403, it might mean the domain is not verified or no data
        if (statsResp.status === 403 || statsResp.status === 404) {
            return new Response(
            JSON.stringify({ 
                data: [],
                status: 'not_found_or_permission',
                message: 'Domain not found in Postmaster Tools or permission denied.',
                serviceAccountEmail: serviceAccount.client_email
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }
        throw new Error(`Postmaster API Error: ${statsResp.statusText}`)
        }

        const statsData = await statsResp.json()

        return new Response(
        JSON.stringify({ data: statsData.trafficStats || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (innerError: any) {
        console.error('Inner Error:', innerError);
        throw innerError;
    }

  } catch (error: any) {
    console.error('Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// Helper to import PEM key
function str2ab(str: string) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

async function importPrivateKey(pem: string) {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  
  let pemContents = pem;
  if (pem.includes(pemHeader)) {
      pemContents = pem.substring(
        pem.indexOf(pemHeader) + pemHeader.length, 
        pem.indexOf(pemFooter)
      );
  }
  
  const binaryDerString = atob(pemContents.replace(/\s/g, ''));
  const binaryDer = str2ab(binaryDerString);

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    true,
    ["sign"]
  );
}