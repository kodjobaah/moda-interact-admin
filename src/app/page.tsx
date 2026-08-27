const merchants = [
  { name: "Northstar Home", domain: "northstar-home.myshopify.com", plan: "Growth", usage: "74%", recoveries: "1,284", messages: "8,942", status: "Healthy" },
  { name: "Atelier Nia", domain: "atelier-nia.myshopify.com", plan: "Pro", usage: "46%", recoveries: "963", messages: "6,410", status: "Healthy" },
  { name: "Morrow Goods", domain: "morrow-goods.myshopify.com", plan: "Starter", usage: "91%", recoveries: "721", messages: "4,806", status: "Review" },
  { name: "Field Notes Co.", domain: "field-notes-co.myshopify.com", plan: "Growth", usage: "28%", recoveries: "412", messages: "2,192", status: "Healthy" },
  { name: "Cedar & Salt", domain: "cedar-salt.myshopify.com", plan: "Growth", usage: "63%", recoveries: "387", messages: "1,884", status: "Healthy" },
];

const metrics = [
  { label: "Active merchants", value: "128", change: "+12.4%", note: "versus last month", tone: "mint" },
  { label: "Messages processed", value: "24,891", change: "+8.7%", note: "this billing period", tone: "blue" },
  { label: "Recovery revenue", value: "£184,320", change: "+16.2%", note: "attributed this month", tone: "gold" },
  { label: "Platform health", value: "99.98%", change: "Nominal", note: "last 30 days", tone: "coral" },
];

export default function Home() {
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><span className="brand-symbol">M</span><span>moda<span className="brand-accent">.</span></span></div>
        <div className="sidebar-label">Platform console</div>
        <nav className="main-nav" aria-label="Main navigation">
          <a className="nav-item active" href="#overview"><span className="nav-icon">+</span>Overview</a>
          <a className="nav-item" href="#merchants"><span className="nav-icon">#</span>Merchants</a>
          <a className="nav-item" href="#usage"><span className="nav-icon">=</span>Usage</a>
          <a className="nav-item" href="#recoveries"><span className="nav-icon">~</span>Recoveries</a>
          <a className="nav-item" href="#operations"><span className="nav-icon">*</span>Operations</a>
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="#settings"><span className="nav-icon">:</span>Settings</a>
          <div className="operator-card"><span className="avatar">KA</span><span><strong>Kwadwo A.</strong><small>Platform admin</small></span><span className="more">...</span></div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar"><div className="breadcrumbs"><span>Platform</span><span>/</span><strong>Overview</strong></div><div className="topbar-actions"><span className="sync-state"><span className="status-dot" />All systems operational</span><button className="icon-button" aria-label="Open notifications">!</button><button className="help-button">?</button></div></header>
        <div className="content-wrap">
          <section className="page-heading"><div><p className="eyebrow">Wednesday, 27 August 2026</p><h1>Good morning, Kwadwo</h1><p className="lede">A clear view of how Moda Interact is working across every merchant.</p></div><button className="date-button">Aug 01 - Aug 31, 2026 <span>v</span></button></section>

          <section className="metric-grid" aria-label="Platform metrics">
            {metrics.map((metric) => <article className={`metric-card ${metric.tone}`} key={metric.label}><div className="metric-top"><span>{metric.label}</span><span className="metric-mark">+</span></div><strong>{metric.value}</strong><p><span className="metric-change">{metric.change}</span> {metric.note}</p></article>)}
          </section>

          <section className="content-grid">
            <article className="panel chart-panel" id="usage"><div className="panel-heading"><div><p className="eyebrow">Usage volume</p><h2>Messages across the platform</h2></div><span className="legend"><i />Messages</span></div><div className="chart-area"><div className="y-axis"><span>10k</span><span>7.5k</span><span>5k</span><span>2.5k</span><span>0</span></div><div className="chart"><div className="grid-lines"><i /><i /><i /><i /><i /></div><div className="bars">{[42, 52, 48, 61, 55, 72, 68, 80, 74, 88, 82, 94].map((height, index) => <span key={index} style={{ height: `${height}%` }}><b /></span>)}</div><div className="x-axis">{["Aug 01", "Aug 05", "Aug 09", "Aug 13", "Aug 17", "Aug 21", "Aug 25", "Aug 29"].map((date) => <span key={date}>{date}</span>)}</div></div></div></article>
            <article className="panel health-panel" id="operations"><div className="panel-heading"><div><p className="eyebrow">Operations</p><h2>System health</h2></div><span className="health-badge"><i />Nominal</span></div><div className="health-score"><strong>99.98<span>%</span></strong><div><span>Uptime</span><small>Last 30 days</small></div></div><div className="health-list"><div><span className="health-icon green">~</span><span><strong>Message delivery</strong><small>99.96% delivered</small></span><b>Good</b></div><div><span className="health-icon blue">*</span><span><strong>Queue processing</strong><small>0 delayed jobs</small></span><b>Good</b></div><div><span className="health-icon gold">!</span><span><strong>Shopify API</strong><small>92% rate headroom</small></span><b>Good</b></div></div></article>
          </section>

          <section className="panel merchants-panel" id="merchants"><div className="panel-heading"><div><p className="eyebrow">Merchant activity</p><h2>Usage by merchant</h2></div><a className="view-link" href="#usage">View all usage <span>-&gt;</span></a></div><div className="table-wrap"><table><thead><tr><th>Merchant</th><th>Plan</th><th>Usage</th><th>Recoveries</th><th>Messages</th><th>Status</th></tr></thead><tbody>{merchants.map((merchant) => <tr key={merchant.domain}><td><span className="merchant-name"><span className="merchant-avatar">{merchant.name.slice(0, 1)}</span><span><strong>{merchant.name}</strong><small>{merchant.domain}</small></span></span></td><td><span className="plan-pill">{merchant.plan}</span></td><td><span className="usage-cell"><span className="usage-bar"><i style={{ width: merchant.usage }} /></span><small>{merchant.usage}</small></span></td><td>{merchant.recoveries}</td><td>{merchant.messages}</td><td><span className={`status ${merchant.status.toLowerCase()}`}><i />{merchant.status}</span></td></tr>)}</tbody></table></div></section>
          <footer className="page-footer"><span>Moda Interact admin console</span><span>Last synced just now</span></footer>
        </div>
      </main>
    </div>
  );
}
