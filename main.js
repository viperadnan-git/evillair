document.getElementById('year').textContent = new Date().getFullYear();

// Underline the nav link of the section crossing the middle of the viewport
const links = document.querySelectorAll('.nav-link[data-section]');
const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((link) => link.classList.toggle('active', link.dataset.section === entry.target.id));
    }
}, { rootMargin: '-50% 0px -50% 0px' });
document.querySelectorAll('section[id]').forEach((section) => observer.observe(section));

// Cursor: mouse/trackpad only
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const dot = document.querySelector('.cursor');
    const ring = document.querySelector('.cursor-ring');
    const ease = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0.15;
    let x = -100, y = -100, rx = x, ry = y;

    addEventListener('mousemove', (e) => {
        x = e.clientX;
        y = e.clientY;
        dot.style.transform = `translate(${x}px, ${y}px)`;
    });
    (function follow() {
        rx += (x - rx) * ease;
        ry += (y - ry) * ease;
        ring.style.transform = `translate(${rx}px, ${ry}px)`;
        requestAnimationFrame(follow);
    })();
    document.addEventListener('mouseover', (e) => ring.classList.toggle('hover', !!e.target.closest('a, button')));
}

// Projects: public GitHub API, cached in localStorage (unauthenticated limit is 60 req/h per IP)
const GH_USER = 'viperadnan-git';
const CACHE_KEY = `gh:${GH_USER}:v2`;
const CACHE_TTL = 6 * 60 * 60 * 1000;
const SHOWN = 6;

const gh = (path) => fetch(`https://api.github.com/${path}`, { headers: { Accept: 'application/vnd.github+json' } })
    .then((res) => {
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        return res.json();
    });

async function loadGitHub() {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { /* storage unavailable */ }
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached;

    try {
        const [user, repos] = await Promise.all([
            gh(`users/${GH_USER}`),
            gh(`users/${GH_USER}/repos?per_page=100&sort=pushed`),
        ]);
        const data = {
            time: Date.now(),
            followers: user.followers,
            repos: repos.filter((r) => !r.fork && !r.archived).map((r) => ({
                name: r.name,
                url: r.html_url,
                description: r.description,
                language: r.language,
                stars: r.stargazers_count,
                forks: r.forks_count,
                pushed: r.pushed_at,
                topics: r.topics || [],
                homepage: r.homepage || null,
                license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
            })),
        };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
        return data;
    } catch (err) {
        if (cached) return cached; // stale beats nothing
        throw err;
    }
}

const num = new Intl.NumberFormat('en');
const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function ago(iso) {
    const days = Math.round((new Date(iso) - Date.now()) / 864e5);
    if (days > -30) return rel.format(days, 'day');
    if (days > -365) return rel.format(Math.round(days / 30), 'month');
    return rel.format(Math.round(days / 365), 'year');
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text; // repo data is untrusted: never innerHTML
    return node;
}

function link(text, href, className) {
    const a = el('a', className, text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
}

function line(...parts) {
    const div = el('div');
    div.append(...parts.filter(Boolean));
    return div;
}

function stat(value, label) {
    const span = el('span');
    span.append(el('b', null, num.format(value)), ` ${label}`);
    return span;
}

const TOPICS_SHOWN = 4;

function renderRepos(repos, sort) {
    const list = document.getElementById('repo-list');
    const sorted = [...repos].sort(sort === 'stars'
        ? (a, b) => b.stars - a.stars
        : (a, b) => new Date(b.pushed) - new Date(a.pushed));

    list.replaceChildren(...sorted.slice(0, SHOWN).map((repo) => {
        // Row = stretched repo link (name); homepage sits above it as its own link
        const title = el('div', 'repo-title');
        const name = el('h3', 'repo-name');
        name.append(link(readable(repo.name), repo.url));
        name.firstChild.title = repo.name;
        title.append(name);
        const home = safeUrl(repo.homepage);
        if (home) title.append(link(home.host + home.pathname.replace(/\/$/, ''), home.href, 'repo-home'));

        const about = el('div', 'repo-about');
        about.append(el('p', 'repo-desc', repo.description || 'No description yet.'));
        if (repo.topics.length) {
            const topics = el('ul', 'repo-topics');
            topics.setAttribute('aria-label', 'Topics');
            topics.append(...repo.topics.slice(0, TOPICS_SHOWN).map((t) => el('li', null, t)));
            const more = repo.topics.length - TOPICS_SHOWN;
            if (more > 0) topics.append(el('li', 'more', `+${more}`));
            about.append(topics);
        }

        const meta = el('div', 'repo-meta');
        meta.append(
            line(stat(repo.stars, 'stars'), stat(repo.forks, 'forks')),
            line(repo.language && el('span', null, repo.language), repo.license && el('span', null, repo.license)),
            line(el('span', null, `Updated ${ago(repo.pushed)}`)),
        );

        const li = el('li', 'repo');
        li.append(title, about, meta);
        return li;
    }));
}

// "video-encoder-bot" -> "Video Encoder Bot"; domain-like names ("user.github.io") stay as-is
const ACRONYMS = new Set(['api', 'cli', 'ui', 'url', 'rss', 'sdk', 'ai', 'js', 'ts', 'py']);
function readable(slug) {
    if (slug.includes('.')) return slug;
    return slug
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
        .join(' ');
}

// Homepage is user-supplied: only http(s), normalised
function safeUrl(value) {
    if (!value) return null;
    try {
        const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
    } catch {
        return null;
    }
}

function renderLanguages(repos) {
    const counts = {};
    for (const r of repos) if (r.language) counts[r.language] = (counts[r.language] || 0) + 1;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (!total) return;

    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 4);
    const rest = ranked.slice(4).reduce((sum, [, n]) => sum + n, 0);
    if (rest) top.push(['Other', rest]);

    const bar = document.getElementById('lang-bar');
    const legend = document.getElementById('lang-legend');
    top.forEach(([name, n], i) => {
        const pct = Math.round((n / total) * 100);
        const shade = 1 - i * 0.2;
        const seg = el('span');
        seg.style.flex = n;
        seg.style.opacity = shade;
        const swatch = el('i');
        swatch.style.opacity = shade;
        const item = el('li');
        item.append(swatch, `${name} ${pct}%`);
        bar.append(seg);
        legend.append(item);
    });
    document.getElementById('langs').hidden = false;
}

(async () => {
    const list = document.getElementById('repo-list');
    try {
        const { repos, followers } = await loadGitHub();
        const stars = repos.reduce((sum, r) => sum + r.stars, 0);
        document.getElementById('gh-summary').textContent =
            `${repos.length} public projects with ${num.format(stars)} stars, followed by ${num.format(followers)} developers on GitHub.`;
        renderLanguages(repos);

        const buttons = document.querySelectorAll('.sort button');
        buttons.forEach((button) => button.addEventListener('click', () => {
            buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
            renderRepos(repos, button.dataset.sort);
        }));
        renderRepos(repos, 'pushed');
        document.querySelector('.sort').hidden = false;
    } catch {
        list.replaceChildren(el('li', 'status', "Couldn't load projects from GitHub right now. Use the link below to see them there."));
    }
})();
