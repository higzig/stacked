/* The database is authoritative. This cache holds only the latest fetched snapshot. */
class CollectionCloud {
  constructor(client, { display = null, onChange, onStatus }) {
    this.client = client;
    this.display = display;
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.orders = [];
    this.business = {};
    this.closed = false;
  }
  async start(business) {
    if (business) this.business = business;
    const topic = this.display || this.business.display_id;
    this.channel = this.client.channel(`collection:${topic}`)
      .on('broadcast', { event: 'changed' }, () => this.refresh())
      .subscribe(status => {
        if (this.closed) return;
        this.onStatus(status === 'SUBSCRIBED' ? 'Live' : 'Reconnecting…');
        if (status === 'SUBSCRIBED') this.refresh();
      });
    // Recover missed messages and refresh after sleep/network outages.
    this.timer = setInterval(() => this.refresh(), 10000);
    this.visibility = () => { if (!document.hidden) this.refresh(); };
    document.addEventListener('visibilitychange', this.visibility);
    await this.refresh();
  }
  async refresh() {
    if (this.closed) return;
    if (this.refreshing) { this.again = true; return this.refreshing; }
    this.refreshing = this.fetchSnapshot().catch(error => {
      if (!this.closed) this.onStatus(`Connection error: ${error.message}`);
    });
    await this.refreshing;
    this.refreshing = null;
    if (this.again && !this.closed) { this.again = false; return this.refresh(); }
  }
  async fetchSnapshot() {
    let rows, business;
    if (this.display) {
      const { data, error } = await this.client.rpc('collection_display', { display: this.display });
      if (error) throw error;
      if (!data) throw new Error('Display not found. Open the link supplied by your business.');
      business = data; rows = data.orders;
    } else {
      const [b, o] = await Promise.all([
        this.client.from('businesses').select('*').eq('id', this.business.id).single(),
        this.client.from('collection_orders').select('*').eq('business_id', this.business.id).neq('status', 'collected').order('created_at')
      ]);
      if (b.error || o.error) throw b.error || o.error;
      business = b.data; rows = o.data;
    }
    if (this.closed) return;
    this.business = business;
    this.orders = rows.map(row => ({
      id: row.id, type: row.type, status: row.status,
      number: row.type === 'number-name' ? String(row.number) : null,
      label: row.type === 'number' ? String(row.number) : row.customer_name,
      createdAt: Date.parse(row.created_at), readyAt: row.ready_at ? Date.parse(row.ready_at) : null,
      collectedAt: row.collected_at ? Date.parse(row.collected_at) : null
    }));
    this.onChange();
    this.onStatus(this.channel?.state === 'joined' ? 'Live' : 'Connected · reconnecting live updates…');
  }
  async mutate(query) {
    const { error } = await query;
    if (error) throw error;
    await this.refresh();
  }
  add(name, number) {
    return this.mutate(this.client.rpc('add_collection_order', {
      target_business: this.business.id, customer_name: name, requested_number: number
    }));
  }
  update(id, fields) {
    return this.mutate(this.client.from('collection_orders').update(fields).eq('business_id', this.business.id).eq('id', id).select('id').single());
  }
  remove(id) {
    return this.mutate(this.client.from('collection_orders').delete().eq('business_id', this.business.id).eq('id', id));
  }
  settings(fields) {
    return this.mutate(this.client.from('businesses').update(fields).eq('id', this.business.id).select('id').single());
  }
  close() {
    this.closed = true;
    this.orders = [];
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.visibility);
    if (this.channel) this.client.removeChannel(this.channel);
  }
}
window.CollectionCloud = CollectionCloud;
