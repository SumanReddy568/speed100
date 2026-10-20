const assert = require('assert');
const server = require('./server');

server.listen(0, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const down = await fetch(`${base}/__down?bytes=200000`);
    assert.strictEqual((await down.arrayBuffer()).byteLength, 200000);
    assert.strictEqual(down.headers.get('access-control-allow-origin'), '*');

    const up = await fetch(`${base}/__up`, { method: 'POST', body: new Uint8Array(123456) });
    assert.deepStrictEqual(await up.json(), { bytes: 123456 });

    assert.ok((await (await fetch(`${base}/ping`)).json()).t > 0);
    assert.strictEqual((await fetch(`${base}/nope`)).status, 404);
    console.log('ok');
    server.close();
});
