import assert from 'node:assert/strict';

export async function testCollectionFlow({ a, b, display, staff, admin, anon, business, base }) {
  assert.equal(business.ready_auto_clear_seconds, 600);
  assert.equal(await b.locator('#autoClearSelect').inputValue(), '600');
  for (const value of ['off','300','600','900','1200','1800']) {
    await b.locator('#autoClearSelect').selectOption(value);
    await b.waitForFunction(expected => !busy && cloud.business.ready_auto_clear_seconds === expected, value === 'off' ? null : Number(value));
    await a.waitForFunction(expected => cloud.business.ready_auto_clear_seconds === expected, value === 'off' ? null : Number(value));
  }
  assert.ok((await staff.from('businesses').update({ready_auto_clear_seconds:60}).eq('id',business.id)).error);
  assert.ok((await anon.rpc('auto_collect_ready_orders')).error);
  assert.ok((await staff.rpc('auto_collect_ready_orders')).error);
  await b.locator('#autoClearSelect').selectOption('off');
  await b.waitForFunction(() => !busy && cloud.business.ready_auto_clear_seconds === null);
  await b.locator('#queueStyleSelect').selectOption('number-name');
  await b.waitForFunction(() => !busy && cloud.business.queue_style === 'number-name');
  const ids = [];
  for (let i = 0; i < 24; i++) {
    const result = await staff.rpc('add_collection_order',{target_business:business.id,customer_name:`Flow ${i}`});
    assert.ifError(result.error); ids.push(result.data);
  }
  for (const id of ids.slice(12)) assert.ifError((await staff.from('collection_orders').update({status:'ready'}).eq('id',id)).error);
  await display.setViewportSize({width:1440,height:900});
  await display.waitForFunction(() => cloud.orders.length === 24 && cloud.orders.filter(o => o.status === 'ready').length === 12);
  await display.evaluate(() => { clearInterval(cloud.timer); boardPages.preparing.page=0; boardPages.ready.page=0; boardPages.preparing.changedAt=performance.now(); boardPages.ready.changedAt=performance.now(); renderBoard(); });
  const first = await display.locator('#preparingList li').evaluateAll(rows => rows.map(r => r.dataset.orderId));
  assert.ok(first.length > 0 && first.length < 12);
  assert.match(await display.locator('#preparingMore').textContent(), /^\+ \d+ more preparing$/);
  assert.match(await display.locator('#readyMore').textContent(), /^\+ \d+ more ready$/);
  assert.equal(await display.locator('#preparingList').evaluate(el => getComputedStyle(el).overflowY),'hidden');
  const fits = () => display.evaluate(() => [...document.querySelectorAll('.board-list')].every(el => el.scrollHeight <= el.clientHeight + 1));
  assert.ok(await fits());
  await display.screenshot({path:'/tmp/popbia-board-overflow.png'});
  await display.waitForFunction(initial => document.querySelector('#preparingList li').dataset.orderId !== initial, first[0], {timeout:10000});
  const second = await display.locator('#preparingList li').evaluateAll(rows => rows.map(r => r.dataset.orderId));
  assert.ok(second.every(id => !first.includes(id)));
  const readyPage = await display.evaluate(() => boardPages.ready.page);
  await display.evaluate(() => { boardPages.preparing.changedAt -= 7001; renderBoard(); });
  assert.equal(await display.evaluate(() => boardPages.ready.page),readyPage);
  // Every order is visited; the next page after the final group wraps deterministically.
  const seen = new Set();
  const pages = await display.evaluate(() => Math.ceil(cloud.orders.filter(o => o.status === 'preparing').length / boardPages.preparing.capacity));
  for (let i = 0; i < pages; i++) {
    (await display.locator('#preparingList li').evaluateAll(rows => rows.map(r => r.dataset.orderId))).forEach(id => seen.add(id));
    await display.evaluate(() => { boardPages.preparing.changedAt -= 7001; renderBoard(); });
  }
  assert.equal(seen.size,12);
  const newReadyId = ids[0];
  assert.ifError((await staff.from('collection_orders').update({status:'ready'}).eq('id',newReadyId)).error);
  await display.waitForSelector(`#readyList [data-order-id="${newReadyId}"]`);
  assert.equal(await display.evaluate(() => boardPages.ready.page),0);
  assert.ok(await fits());
  await display.setViewportSize({width:768,height:1024}); await display.evaluate(() => renderBoard()); assert.ok(await fits());
  await display.setViewportSize({width:375,height:812});
  await display.waitForFunction(() => document.querySelectorAll('#readyList .order-card').length === 13);
  assert.equal(await display.locator('#readyList .order-card').count(),13);
  assert.equal(await display.locator('#preparingList .order-card').count(),11);
  assert.ok(await display.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await display.screenshot({path:'/tmp/popbia-board-phone.png',fullPage:true});
  const phoneUrl = await display.locator('#boardQrUrl').getAttribute('href');
  assert.ok(phoneUrl.includes('phone=1'));
  await display.goto(phoneUrl); await display.waitForFunction(() => cloud.orders.length === 24);
  await display.setViewportSize({width:1440,height:900});
  assert.equal(await display.locator('#readyList .order-card').count(),13);
  assert.equal(await display.locator('#readyMore').textContent(),'');
  await display.goto(base + `/board.html?display=${business.display_id}`);
  await display.waitForFunction(() => cloud.orders.length === 24);
  await display.evaluate(() => clearInterval(cloud.timer));
  console.log(`PASS: measured shared-screen capacity (${first.length} rows at 1440×900), seven-second automatic rotation, independent columns, full cycle, immediate newly Ready visibility, 375/768/1440px layouts and full QR phone queue.`);

  const serverTime = Date.parse((await staff.rpc('collection_entitlement',{target_business:business.id})).data.server_time);
  const oldReady = new Date(serverTime - 31*60000).toISOString();
  const automatic = ids[12], manual = ids[13];
  const before = (await staff.from('collection_orders').select('*').eq('id',automatic).single()).data;
  assert.ok(before.ready_at && Date.parse(before.ready_at) >= Date.parse(before.created_at));
  assert.ifError((await admin.from('collection_orders').update({ready_at:oldReady}).in('id',[automatic,manual])).error);
  assert.ifError((await staff.from('collection_orders').update({status:'collected'}).eq('id',manual)).error);
  // Off truly disables expiry, even if the privileged worker runs.
  assert.ifError((await admin.rpc('auto_collect_ready_orders')).error);
  assert.equal((await staff.from('collection_orders').select('status').eq('id',automatic).single()).data.status,'ready');
  await b.locator('#autoClearSelect').selectOption('300');
  await b.waitForFunction(() => !busy && cloud.business.ready_auto_clear_seconds === 300);
  // Only the actual scheduled job performs this expiry (polling is disabled on observers).
  await a.evaluate(() => clearInterval(cloud.timer)); await b.evaluate(() => clearInterval(cloud.timer));
  await display.waitForFunction(id => !cloud.orders.some(o => o.id === id), automatic, {timeout:45000});
  await a.waitForFunction(id => !cloud.orders.some(o => o.id === id),automatic);
  await b.waitForFunction(id => !cloud.orders.some(o => o.id === id),automatic);
  const history = (await staff.from('collection_orders').select('*').eq('id',automatic).single()).data;
  assert.equal(history.status,'collected'); assert.equal(Date.parse(history.ready_at),Date.parse(oldReady)); assert.ok(history.collected_at);
  assert.equal(history.created_at,before.created_at); assert.equal(history.customer_name,before.customer_name);
  const manualHistory = (await staff.from('collection_orders').select('*').eq('id',manual).single()).data;
  assert.equal(manualHistory.status,'collected'); assert.ok(manualHistory.collected_at);
  const offline = ids[14];
  await Promise.all([a.goto('about:blank'),b.goto('about:blank'),display.goto('about:blank')]);
  assert.ifError((await admin.from('collection_orders').update({ready_at:oldReady}).eq('id',offline)).error);
  const deadline = Date.now()+45000;
  let offlineHistory;
  do {
    offlineHistory = (await staff.from('collection_orders').select('*').eq('id',offline).single()).data;
    if (offlineHistory.status === 'collected') break;
    await new Promise(resolve => setTimeout(resolve,1000));
  } while (Date.now() < deadline);
  assert.equal(offlineHistory.status,'collected'); assert.ok(offlineHistory.collected_at);
  assert.equal((await staff.from('collection_orders').select('id').in('id',ids)).data.length,24);
  // Restore the existing suite's state; rows remain available in history.
  assert.ifError((await staff.from('collection_orders').update({status:'collected'}).eq('business_id',business.id).neq('status','collected')).error);
  assert.ifError((await staff.from('businesses').update({ready_auto_clear_seconds:600,queue_style:'name'}).eq('id',business.id)).error);
  await Promise.all([a.goto(base+'/board-admin.html'),b.goto(base+'/board-admin.html'),display.goto(base+`/board.html?display=${business.display_id}`)]);
  await a.waitForFunction(() => cloud?.entitlement?.access_allowed); await b.waitForFunction(() => cloud?.entitlement?.access_allowed);
  console.log('PASS: default/settings/Off, Ready timestamp, manual collection, scheduled database expiry without pages open, retained history, denied client worker access and Realtime on all devices.');
}
