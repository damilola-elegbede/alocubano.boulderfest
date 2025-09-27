// Edge Runtime - bundles instantly, no Node.js overhead
export const config = {
  runtime: 'edge'
};

export default function handler(req) {
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: Date.now()
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    }
  });
}