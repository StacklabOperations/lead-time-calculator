// STACKABL — Aligni GraphQL Proxy Worker
// Stores the API token server-side so it never touches the browser.
// Deploy this to Cloudflare Workers, then add ALIGNI_TOKEN as a secret.

export default {
  async fetch(request, env) {

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const body = await request.text();

    const upstream = await fetch('https://stacklab.aligni.com/api/v3/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${env.ALIGNI_TOKEN}`,
      },
      body,
    });

    const data = await upstream.text();

    return new Response(data, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};
