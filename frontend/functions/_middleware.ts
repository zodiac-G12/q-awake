interface PagesContext {
  request: Request & { cf?: { country?: string } };
  next: () => Promise<Response>;
}

const BLOCKED_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>地域制限 — Q-Awake</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#0b0d17;color:#e7eaf3;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;}
.box{max-width:420px;padding:32px;text-align:center;}
h1{font-size:20px;margin:0 0 12px;}
p{color:#8a93a8;font-size:14px;line-height:1.6;}
</style>
</head>
<body><div class="box">
<h1>このサービスは日本国内のみご利用いただけます</h1>
<p>地域判定はネットワーク経路 (IPアドレス) に基づいて行われます。<br>VPNや海外回線をご利用の場合はオフにしてから再度お試しください。</p>
</div></body></html>`;

export async function onRequest(context: PagesContext): Promise<Response> {
  const country = context.request.cf?.country;
  if (country && country !== "JP") {
    return new Response(BLOCKED_HTML, {
      status: 403,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return context.next();
}
