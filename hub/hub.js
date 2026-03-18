(() => {
    'use strict';

    /* ===== Theme ===== */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('hub-theme', theme);
    }

    const savedTheme = localStorage.getItem('hub-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);

    let manifest = { team: [], prototypes: [] };
    let activeFilter = 'all';
    let currentUser = null;
    let currentProtoId = null;
    let currentVariantId = null;

    let arenaConfig = { mode: 'workspace', hubUrl: '', hubRepoPath: '' };
    let activeSpace = 'personal';
    let hubManifest = null;

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const views = {
        dashboard: $('#dashboard-view'),
        detail: $('#detail-view'),
    };

    function avatarColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return `hsl(${Math.abs(hash) % 360}, 55%, 48%)`;
    }

    function initials(name) {
        return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
    }

    function teamMember(id) {
        const am = getActiveManifest();
        return am.team.find((m) => m.id === id) || manifest.team.find((m) => m.id === id) || { name: id, role: '' };
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    function slugify(str) {
        return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    /* ===== Identity ===== */
    function getCookieEmail() {
        const cookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('CF_Authorization='));
        if (!cookie) return null;
        try {
            const token = cookie.split('=')[1];
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.email || null;
        } catch { return null; }
    }

    const COMPANY_DOMAIN = 'ridewithvia.com';
    const HUB_ROOT = '$HOME/Documents/Arena';

    function resolveCurrentUser() {
        const email = getCookieEmail() || localStorage.getItem('hub-user-email');
        if (email) {
            currentUser = memberFromEmail(email);
            renderIdentityIndicator();
            hideIdentityPrompt();
            return;
        }
        showIdentityPrompt();
    }

    function memberFromEmail(email) {
        const exact = manifest.team.find(m => m.email === email);
        if (exact) return exact;
        const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return { id: email, name, role: '', email };
    }

    function showIdentityPrompt() {
        const screen = $('#identity-prompt');
        if (screen) screen.style.display = 'flex';
        // Pre-fill from previous session if user just switched
        const lastEmail = localStorage.getItem('hub-user-email');
        const input = $('#identity-email-input');
        if (input && lastEmail) input.value = lastEmail;
    }

    function hideIdentityPrompt() {
        const screen = $('#identity-prompt');
        if (screen) screen.style.display = 'none';
    }

    function setLoginError(msg) {
        const el = $('#login-error');
        if (!el) return;
        if (msg) { el.textContent = msg; el.style.display = ''; }
        else el.style.display = 'none';
    }

    function handleIdentitySave() {
        const input = $('#identity-email-input');
        const email = (input.value || '').trim().toLowerCase();
        if (!email) { input.focus(); return; }

        if (!email.endsWith('@' + COMPANY_DOMAIN)) {
            setLoginError(`Please use your @${COMPANY_DOMAIN} email address.`);
            input.focus();
            return;
        }
        setLoginError(null);
        localStorage.setItem('hub-user-email', email);
        currentUser = memberFromEmail(email);
        renderIdentityIndicator();
        hideIdentityPrompt();
        applyModeUI();
    }

    /* ===== Pending Access Requests (localStorage) ===== */
    const PENDING_KEY = 'arena-pending-requests';

    function getPendingRequests() {
        try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); }
        catch { return []; }
    }

    function addPendingRequest(email) {
        const reqs = getPendingRequests();
        if (!reqs.find(r => r.email === email)) {
            reqs.push({ email, requestedAt: new Date().toISOString() });
            localStorage.setItem(PENDING_KEY, JSON.stringify(reqs));
        }
    }

    function dismissPendingRequest(email) {
        const reqs = getPendingRequests().filter(r => r.email !== email);
        localStorage.setItem(PENDING_KEY, JSON.stringify(reqs));
    }

    function updatePendingBadge() {
        const badge = $('#pending-requests-badge');
        if (!badge || !isAdmin()) return;
        const count = getPendingRequests().length;
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    function renderPendingRequests() {
        const section = $('#pending-requests-section');
        const list = $('#pending-requests-list');
        if (!section || !list || !isAdmin()) { if (section) section.style.display = 'none'; return; }

        const reqs = getPendingRequests();
        if (reqs.length === 0) { section.style.display = 'none'; return; }

        section.style.display = '';
        list.innerHTML = reqs.map(r => {
            const date = new Date(r.requestedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return `<div class="pending-request-row" data-email="${r.email}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                <span class="pending-request-email">${r.email}</span>
                <span class="pending-request-date">${date}</span>
                <div class="pending-request-actions">
                    <button class="hub-btn hub-btn-primary pending-request-approve" data-email="${r.email}">Approve</button>
                    <button class="hub-btn hub-btn-ghost pending-request-dismiss" data-email="${r.email}">Dismiss</button>
                </div>
            </div>`;
        }).join('');

        list.querySelectorAll('.pending-request-approve').forEach(btn => {
            btn.addEventListener('click', () => {
                const email = btn.dataset.email;
                dismissPendingRequest(email);
                closeTeamViewModal();
                openAddMemberModal();
                const emailInput = $('#input-member-email');
                if (emailInput) { emailInput.value = email; emailInput.disabled = false; }
            });
        });

        list.querySelectorAll('.pending-request-dismiss').forEach(btn => {
            btn.addEventListener('click', () => {
                dismissPendingRequest(btn.dataset.email);
                renderPendingRequests();
                updatePendingBadge();
            });
        });
    }

    function showRequestAccessScreen() {
        const screen = $('#request-access-screen');
        if (!screen) return;
        const emailEl = $('#request-access-email');
        if (emailEl && currentUser) emailEl.textContent = currentUser.email;
        screen.style.display = 'flex';

        const reqBtn = $('#btn-request-access');
        if (reqBtn) {
            const newBtn = reqBtn.cloneNode(true);
            reqBtn.replaceWith(newBtn);
            newBtn.addEventListener('click', async () => {
                const email = currentUser?.email;
                newBtn.disabled = true;
                newBtn.textContent = 'Sending…';
                // Store locally for admin to see
                if (email) addPendingRequest(email);
                // Also try Worker if deployed
                try {
                    await fetch('/api/request-access', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                } catch { /* Worker not deployed yet */ }
                newBtn.style.display = 'none';
                const note = $('#request-access-note');
                if (note) note.style.display = '';
            });
        }

        const switchBtn = $('#btn-switch-user');
        if (switchBtn) {
            const newSwitch = switchBtn.cloneNode(true);
            switchBtn.replaceWith(newSwitch);
            newSwitch.addEventListener('click', () => {
                localStorage.removeItem('hub-user-email');
                document.cookie = 'hub-user-email=; Max-Age=0; path=/';
                currentUser = null;
                screen.style.display = 'none';
                showIdentityPrompt();
            });
        }
    }

    function renderIdentityIndicator() {
        const el = $('#identity-indicator');
        if (!el || !currentUser) { if (el) el.style.display = 'none'; return; }
        const color = avatarColor(currentUser.name);
        const photoUrl = localStorage.getItem('hub-user-photo');
        if (photoUrl) {
            el.innerHTML = `<div class="avatar" style="background:transparent"><img src="${photoUrl}" alt="${currentUser.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`;
        } else {
            el.innerHTML = `<div class="avatar" style="background:${color}">${initials(currentUser.name)}</div>`;
        }
        el.style.display = 'flex';
        el.title = currentUser.email;
        renderSidebarProfile();
    }

    function renderSidebarProfile() {
        const avatarEl = $('#sp-footer-avatar');
        const nameEl = $('#sp-footer-username');
        if (!avatarEl || !nameEl) return;
        if (!currentUser) {
            avatarEl.innerHTML = '';
            nameEl.textContent = '';
            return;
        }
        const color = avatarColor(currentUser.name);
        const photoUrl = localStorage.getItem('hub-user-photo');
        if (photoUrl) {
            avatarEl.innerHTML = `<img src="${photoUrl}" alt="${currentUser.name}">`;
            avatarEl.style.background = 'transparent';
        } else {
            avatarEl.innerHTML = initials(currentUser.name);
            avatarEl.style.background = color;
        }
        nameEl.textContent = currentUser.name;
    }

    function handleIdentityClick() {
        if (!currentUser) return;
        const color = avatarColor(currentUser.name);
        const photoUrl = localStorage.getItem('hub-user-photo');
        const avatarContent = photoUrl
            ? `<img src="${photoUrl}" alt="${currentUser.name}">`
            : initials(currentUser.name);
        $('#identity-modal-user').innerHTML = `
            <div class="identity-modal-avatar" style="background:${color}">${avatarContent}</div>
            <div class="identity-modal-details">
                <div class="identity-modal-name">${currentUser.name}</div>
                <div class="identity-modal-email">${currentUser.email}</div>
                ${currentUser.role ? `<div class="identity-modal-role">${currentUser.role}</div>` : ''}
            </div>`;

        // Photo preview
        const previewEl = $('#profile-photo-preview');
        if (photoUrl) {
            previewEl.innerHTML = `<img src="${photoUrl}" alt="${currentUser.name}">`;
            previewEl.style.background = 'transparent';
            $('#profile-remove-photo').style.display = '';
        } else {
            previewEl.innerHTML = initials(currentUser.name);
            previewEl.style.background = color;
            $('#profile-remove-photo').style.display = 'none';
        }

        // Team section visibility
        const teamSection = $('#profile-teams-section');
        if (teamSection) teamSection.style.display = isAdmin() ? '' : 'none';

        syncProfileThemeSwitch();
        $('#identity-modal-overlay').classList.add('open');
    }

    function syncProfileThemeSwitch() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const toggle = $('#profile-theme-toggle');
        if (toggle) toggle.classList.toggle('active', isDark);
    }

    function handlePhotoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            localStorage.setItem('hub-user-photo', dataUrl);
            renderIdentityIndicator();
            handleIdentityClick();
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    function handlePhotoRemove() {
        localStorage.removeItem('hub-user-photo');
        renderIdentityIndicator();
        handleIdentityClick();
    }

    function closeIdentityModal() {
        $('#identity-modal-overlay').classList.remove('open');
    }

    function switchUser() {
        closeIdentityModal();
        localStorage.removeItem('hub-user-email');
        localStorage.removeItem('hub-user-photo');
        currentUser = null;
        renderIdentityIndicator();
        showIdentityPrompt();
    }

    function userAccess() {
        if (!currentUser) return null;
        if (currentUser.access) return currentUser.access;
        return currentUser.admin ? 'admin' : 'editor';
    }

    function isAdmin()  { return userAccess() === 'admin'; }
    function isEditor() { const a = userAccess(); return a === 'editor' || a === 'admin'; }
    function isViewer() { return userAccess() === 'viewer'; }

    function isInRoster() {
        if (!currentUser) return false;
        return manifest.team.some(m => m.email === currentUser.email);
    }

    function renderAdminUI() {
        const teamSection = $('#profile-teams-section');
        if (teamSection) teamSection.style.display = isAdmin() ? '' : 'none';
        updatePendingBadge();
    }

    /* ===== Space Management ===== */
    function isHubMode() {
        return arenaConfig.mode === 'hub';
    }

    function isReadOnly() {
        return isHubMode() || activeSpace === 'hub';
    }

    function getActiveManifest() {
        if (isHubMode()) return manifest;
        return activeSpace === 'personal' ? manifest : (hubManifest || { team: [], prototypes: [] });
    }

    function getVariantBasePath() {
        if (!isHubMode() && activeSpace === 'hub' && arenaConfig.hubUrl) {
            return arenaConfig.hubUrl.replace(/\/$/, '') + '/';
        }
        return '';
    }

    function renderSpaceToggle() {
        const toggle = $('#space-toggle');
        if (!toggle) return;
        if (isHubMode() || isViewer()) {
            toggle.style.display = 'none';
            return;
        }
        toggle.style.display = 'flex';
        toggle.querySelectorAll('.space-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.space === activeSpace);
        });
    }

    async function switchSpace(space) {
        if (space === activeSpace) return;
        activeSpace = space;
        activeFilter = 'all';
        renderSpaceToggle();

        if (space === 'hub' && !hubManifest && arenaConfig.hubUrl) {
            try {
                const url = arenaConfig.hubUrl.replace(/\/$/, '') + '/prototypes.json';
                hubManifest = await (await fetch(url)).json();
            } catch (e) {
                console.error('Failed to fetch hub manifest:', e);
                hubManifest = { team: [], prototypes: [] };
            }
        }

        // Hide/show workspace-only UI
        const newBtn = $('#btn-new-prototype');
        if (newBtn) newBtn.style.display = (isReadOnly() || !isEditor()) ? 'none' : '';

        renderDashboard();
    }

    function applyModeUI() {
        if (currentUser && !isInRoster()) {
            showRequestAccessScreen();
            return;
        }

        const newBtn = $('#btn-new-prototype');
        const editorCanAct = isEditor() && !isReadOnly();
        if (!editorCanAct) {
            if (newBtn) newBtn.style.display = 'none';
        } else {
            if (newBtn) newBtn.style.display = '';
        }

        renderAdminUI();
        renderSpaceToggle();
    }

    /* ===== Routing ===== */
    function navigate(hash) { window.location.hash = hash; }

    function handleRoute() {
        const hash = window.location.hash || '#/';
        Object.values(views).forEach((v) => v.classList.remove('active'));

        if (hash.startsWith('#/prototype/')) {
            const parts = hash.replace('#/prototype/', '').split('/');
            showDetail(parts[0], parts[1]);
        } else {
            showDashboard();
        }
    }

    /* ===== Dashboard ===== */
    function showDashboard() {
        views.dashboard.classList.add('active');
        renderFilters();
        renderDashboard();
    }

    function renderFilters() {
        const activeManifest = getActiveManifest();
        const creators = [...new Set(activeManifest.prototypes.map((p) => p.createdBy))];
        const container = $('.hub-filters');
        const chips = [{ id: 'all', label: 'All' }];
        creators.forEach((cid) => chips.push({ id: cid, label: teamMember(cid).name }));

        container.innerHTML = chips
            .map((c) => `<button class="filter-chip ${activeFilter === c.id ? 'active' : ''}" data-filter="${c.id}">${c.label}</button>`)
            .join('');

        container.querySelectorAll('.filter-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
                activeFilter = btn.dataset.filter;
                renderFilters();
                renderDashboard();
            });
        });
    }

    function renderDashboard() {
        renderList();
    }

    function renderList() {
        const grid = $('#prototype-grid');
        const empty = $('#empty-state');
        const activeManifest = getActiveManifest();
        const readOnly = isReadOnly() || !isEditor();
        const basePath = getVariantBasePath();
        let protos = activeManifest.prototypes;

        if (activeFilter !== 'all') protos = protos.filter((p) => p.createdBy === activeFilter);

        if (protos.length === 0) {
            grid.innerHTML = '';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';

        const sorted = [...protos].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

        const chevronSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
        const trashSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
        const shareSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
        const plusSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
        const editSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        const editSmallSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        const publishSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>';
        const publishLgSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>';

        grid.innerHTML = sorted.map(p => {
            const member = teamMember(p.createdBy);
            const varCount = p.variants.length;
            const color = avatarColor(member.name);

            const variantListHTML = p.variants.map(v => {
                const varPath = basePath + v.path;
                const actions = readOnly
                    ? `<button class="list-variant-share" data-path="${varPath}" title="Copy link">${shareSvg}</button>`
                    : `<button class="list-variant-edit" data-proto-id="${p.id}" title="Edit prototype">${editSmallSvg}</button>
                       <button class="list-variant-share" data-path="${v.path}" title="Copy link">${shareSvg}</button>
                       <button class="list-variant-publish" data-proto-id="${p.id}" title="Publish to Hub">${publishSvg}</button>
                       <button class="list-variant-delete" data-proto-id="${p.id}" data-variant-id="${v.id}" title="Delete variant">${trashSvg}</button>`;
                return `<div class="list-variant-item" data-proto-id="${p.id}" data-variant-id="${v.id}">
                    <span class="list-variant-dot"></span>
                    <div class="list-variant-info">
                        <span class="list-variant-name">${v.name}</span>
                        ${v.description ? `<span class="list-variant-desc">${v.description}</span>` : ''}
                    </div>
                    ${actions}
                </div>`;
            }).join('');

            const newVariantBtn = readOnly ? '' : `<button class="list-new-variant" data-proto-id="${p.id}">${plusSvg} New Variant</button>`;

            const metaActions = readOnly
                ? ''
                : `<button class="list-item-publish btn-publish-proto" data-id="${p.id}" title="Publish to Hub">${publishLgSvg}</button>
                   <button class="list-item-edit btn-edit-proto" data-id="${p.id}" title="Edit">${editSvg}</button>`;

            return `<div class="prototype-list-item" data-id="${p.id}">
                <div class="list-item-row">
                    <button class="list-item-expand" data-id="${p.id}">${chevronSvg}</button>
                    <div class="list-item-info">
                        <div class="list-item-name">${p.name}</div>
                        <div class="list-item-description">${p.description}</div>
                    </div>
                    <div class="list-item-meta">
                        <div class="list-item-creator">
                            <div class="avatar" style="background:${color}">${initials(member.name)}</div>
                            ${member.name}
                        </div>
                        <span class="list-item-variants">${varCount} variant${varCount !== 1 ? 's' : ''}</span>
                        ${metaActions}
                    </div>
                </div>
                <div class="list-variant-list">${variantListHTML}${newVariantBtn}</div>
            </div>`;
        }).join('');

        grid.querySelectorAll('.prototype-list-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.list-item-expand') || e.target.closest('.list-variant-item') || e.target.closest('.list-variant-delete') || e.target.closest('.list-variant-share') || e.target.closest('.list-variant-edit') || e.target.closest('.list-new-variant') || e.target.closest('.btn-edit-proto')) return;
                item.classList.toggle('expanded');
            });
        });

        grid.querySelectorAll('.list-item-edit.btn-edit-proto').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(btn.dataset.id);
            });
        });

        grid.querySelectorAll('.list-item-expand').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = btn.closest('.prototype-list-item');
                item.classList.toggle('expanded');
            });
        });

        grid.querySelectorAll('.list-variant-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                navigate(`#/prototype/${el.dataset.protoId}/${el.dataset.variantId}`);
            });
        });

        grid.querySelectorAll('.list-variant-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(btn.dataset.protoId);
            });
        });

        grid.querySelectorAll('.list-variant-share').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyVariantLink(btn.dataset.path, btn);
            });
        });

        grid.querySelectorAll('.list-variant-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const activeManifest = getActiveManifest();
                const proto = activeManifest.prototypes.find(p => p.id === btn.dataset.protoId);
                const variant = proto?.variants.find(v => v.id === btn.dataset.variantId);
                if (proto && variant) openDeleteModal(proto, variant);
            });
        });

        grid.querySelectorAll('.list-variant-publish').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openPublishModal(btn.dataset.protoId);
            });
        });

        grid.querySelectorAll('.list-item-publish.btn-publish-proto').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openPublishModal(btn.dataset.id);
            });
        });

        grid.querySelectorAll('.list-new-variant').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openVariantModalFor(btn.dataset.protoId);
            });
        });
    }

    /* ===== Detail View ===== */
    function showDetail(id, variantId) {
        const activeManifest = getActiveManifest();
        const proto = activeManifest.prototypes.find((p) => p.id === id);
        if (!proto) { navigate('#/'); return; }

        currentProtoId = id;
        views.detail.classList.add('active');

        const variant = variantId
            ? proto.variants.find(v => v.id === variantId) || proto.variants[0]
            : proto.variants[0];

        if (variant) {
            currentVariantId = variant.id;
            loadVariant(getVariantBasePath() + variant.path);
        }

        renderSidePanel();
    }

    function loadVariant(path) {
        const iframe = $('#prototype-iframe');
        iframe.classList.add('fade-out');

        const swap = () => {
            iframe.src = path;
            const reveal = () => {
                iframe.classList.remove('fade-out');
                iframe.removeEventListener('load', reveal);
            };
            iframe.addEventListener('load', reveal);
        };

        if (iframe.src && iframe.src !== 'about:blank') {
            setTimeout(swap, 200);
        } else {
            swap();
        }
    }

    /* ===== Side Panel ===== */
    function openSidePanel() {
        $('#sp-drawer').classList.add('open');
        $('#sp-tab').classList.add('open');
    }

    function closeSidePanel() {
        $('#sp-drawer').classList.remove('open');
        $('#sp-tab').classList.remove('open');
    }

    function renderSidePanel() {
        const list = $('#sp-proto-list');
        const readOnly = isReadOnly() || !isEditor();
        const basePath = getVariantBasePath();
        const activeManifest = getActiveManifest();
        const chevronSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
        const plusSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
        const trashSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
        const shareSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
        const editSmallSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        const publishSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>';

        list.innerHTML = activeManifest.prototypes.map(p => {
            const member = teamMember(p.createdBy);
            const isCurrent = p.id === currentProtoId;
            const varCount = p.variants.length;
            const expanded = isCurrent;

            const variantListHTML = p.variants.map(v => {
                const isActive = isCurrent && v.id === currentVariantId;
                const varPath = basePath + v.path;
                const actions = readOnly
                    ? `<button class="sp-variant-share" data-path="${varPath}" title="Copy link">${shareSvg}</button>`
                    : `<button class="sp-variant-edit" data-proto-id="${p.id}" title="Edit prototype">${editSmallSvg}</button>
                       <button class="sp-variant-share" data-path="${v.path}" title="Copy link">${shareSvg}</button>
                       <button class="sp-variant-publish" data-proto-id="${p.id}" title="Publish to Hub">${publishSvg}</button>
                       <button class="sp-variant-delete" data-proto-id="${p.id}" data-variant-id="${v.id}" title="Delete variant">${trashSvg}</button>`;
                return `<div class="sp-variant ${isActive ? 'active' : ''}" data-proto-id="${p.id}" data-variant-id="${v.id}" data-path="${varPath}">
                    <span class="sp-variant-dot"></span>
                    <div class="sp-variant-info">
                        <span class="sp-variant-name">${v.name}</span>
                        ${v.description ? `<span class="sp-variant-desc">${v.description}</span>` : ''}
                    </div>
                    ${actions}
                </div>`;
            }).join('');

            const newVariantBtn = readOnly ? '' : `<button class="sp-new-variant" data-proto-id="${p.id}">
                ${plusSvg} New Variant
            </button>`;

            return `<div class="sp-proto ${expanded ? 'expanded' : ''}" data-id="${p.id}">
                <div class="sp-proto-header" data-id="${p.id}">
                    <button class="sp-proto-expand" data-id="${p.id}">${chevronSvg}</button>
                    <div class="sp-proto-info">
                        <span class="sp-proto-name">${p.name}</span>
                        ${p.description ? `<span class="sp-proto-desc">${p.description}</span>` : ''}
                    </div>
                    <span class="sp-proto-variant-count">${varCount} variant${varCount !== 1 ? 's' : ''}</span>
                </div>
                <div class="sp-variant-list">${variantListHTML}${newVariantBtn}</div>
            </div>`;
        }).join('');

        list.querySelectorAll('.sp-proto-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.sp-proto-expand')) return;
                const protoId = header.dataset.id;
                const proto = manifest.prototypes.find(p => p.id === protoId);
                if (!proto) return;

                if (proto.variants.length === 1) {
                    navigateToVariant(protoId, proto.variants[0].id, proto.variants[0].path);
                } else {
                    toggleProtoExpand(protoId);
                }
            });
        });

        list.querySelectorAll('.sp-proto-expand').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleProtoExpand(btn.dataset.id);
            });
        });

        list.querySelectorAll('.sp-variant').forEach(el => {
            el.addEventListener('click', () => {
                navigateToVariant(el.dataset.protoId, el.dataset.variantId, el.dataset.path);
            });
        });

        list.querySelectorAll('.sp-new-variant').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openVariantModalFor(btn.dataset.protoId);
            });
        });

        list.querySelectorAll('.sp-variant-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(btn.dataset.protoId);
            });
        });

        list.querySelectorAll('.sp-variant-share').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyVariantLink(btn.dataset.path, btn);
            });
        });

        list.querySelectorAll('.sp-variant-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const am = getActiveManifest();
                const proto = am.prototypes.find(p => p.id === btn.dataset.protoId);
                const variant = proto?.variants.find(v => v.id === btn.dataset.variantId);
                if (proto && variant) openDeleteModal(proto, variant);
            });
        });

        list.querySelectorAll('.sp-variant-publish').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openPublishModal(btn.dataset.protoId);
            });
        });
    }

    function toggleProtoExpand(protoId) {
        const card = $(`#sp-proto-list .sp-proto[data-id="${protoId}"]`);
        if (card) card.classList.toggle('expanded');
    }

    function copyVariantLink(variantPath, btn) {
        const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
        const url = base + variantPath;
        navigator.clipboard.writeText(url).then(() => {
            btn.classList.add('copied');
            const tooltip = document.createElement('span');
            tooltip.className = 'copy-tooltip';
            tooltip.textContent = 'Copied!';
            btn.style.position = 'relative';
            btn.appendChild(tooltip);
            setTimeout(() => {
                btn.classList.remove('copied');
                tooltip.remove();
            }, 1500);
        });
    }

    function navigateToVariant(protoId, variantId, path) {
        currentProtoId = protoId;
        currentVariantId = variantId;
        loadVariant(path);
        renderSidePanel();

        window.history.replaceState(null, '', `#/prototype/${protoId}`);
    }

    /* ===== Delete Variant Modal ===== */
    let pendingDeleteProto = null;
    let pendingDeleteVariant = null;

    function openDeleteModal(proto, variant) {
        pendingDeleteProto = proto;
        pendingDeleteVariant = variant;
        $('#delete-modal-message').textContent = `Are you sure you want to delete "${variant.name}"? This will remove the variant directory and update prototypes.json.`;
        $('#delete-modal-output').style.display = 'none';
        $('#delete-modal-footer').style.display = 'flex';
        $('#delete-modal-overlay').classList.add('open');
    }

    function closeDeleteModal() {
        $('#delete-modal-overlay').classList.remove('open');
        pendingDeleteProto = null;
        pendingDeleteVariant = null;
    }

    function confirmDeleteVariant() {
        if (!pendingDeleteProto || !pendingDeleteVariant) return;
        const cmd = `cd "${HUB_ROOT}" && ./scripts/delete-variant.sh ${pendingDeleteProto.id} ${pendingDeleteVariant.id}`;
        $('#delete-modal-output-code').textContent = cmd;
        $('#delete-modal-output').style.display = 'block';
        $('#delete-modal-footer').style.display = 'none';
    }

    function copyDeleteOutput() {
        navigator.clipboard.writeText($('#delete-modal-output-code').textContent).then(() => {
            const btn = $('#btn-delete-copy-output');
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = 'Copy to Clipboard';
                closeDeleteModal();
            }, 1500);
        });
    }

    /* ===== Publish Modal ===== */
    let publishingProtoId = null;

    function openPublishModal(protoId) {
        const proto = manifest.prototypes.find(p => p.id === protoId);
        if (!proto) return;
        publishingProtoId = protoId;

        const varCount = proto.variants.length;
        $('#publish-modal-message').textContent = `Publish "${proto.name}" (${varCount} variant${varCount !== 1 ? 's' : ''}) to the public hub? All variants will be copied.`;
        $('#publish-modal-output').style.display = 'none';
        $('#publish-modal-footer').style.display = 'flex';
        $('#publish-modal-overlay').classList.add('open');
    }

    function closePublishModal() {
        $('#publish-modal-overlay').classList.remove('open');
        publishingProtoId = null;
    }

    function confirmPublish() {
        if (!publishingProtoId) return;
        const hubPath = arenaConfig.hubRepoPath || '~/Documents/arena-hub';
        const cmd = `cd "${HUB_ROOT}" && ./scripts/publish.sh ${publishingProtoId} --hub-repo "${hubPath}"`;
        $('#publish-modal-output-code').textContent = cmd;
        $('#publish-modal-output').style.display = 'block';
        $('#publish-modal-footer').style.display = 'none';
    }

    function copyPublishOutput() {
        navigator.clipboard.writeText($('#publish-modal-output-code').textContent).then(() => {
            const btn = $('#btn-publish-copy-output');
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = 'Copy to Clipboard';
                closePublishModal();
            }, 1500);
        });
    }

    /* ===== Guide Modal ===== */
    function openGuideModal() {
        renderGuide();
        $('#guide-modal-overlay').classList.add('open');
    }

    function closeGuideModal() {
        $('#guide-modal-overlay').classList.remove('open');
    }

    function renderGuide() {
        $('#guide-body').innerHTML = `
<h2>What is Arena?</h2>
<p>Arena is a shared platform for the product and design team to create, showcase, and test interactive prototypes. Each prototype can have multiple <strong>variants</strong> (different design solutions for the same feature) that you can toggle between instantly.</p>

<h2>Browsing Prototypes (Stakeholders)</h2>
<p>If you're visiting the hosted URL to review prototypes:</p>
<ol>
    <li>Visit the hub URL shared with you</li>
    <li>Enter your <code>@ridewithvia.com</code> email when prompted</li>
    <li>Check your inbox for a one-time verification code and enter it</li>
    <li>Browse the dashboard and click any prototype card to open it</li>
    <li>Use the <strong>segment control bar</strong> at the top to toggle between variants</li>
    <li>Interact with the prototype directly in the full-screen view</li>
</ol>

<h2>Setting Up Your Environment (Contributors)</h2>
<p>To create or edit prototypes, you'll need Git and a code editor (we recommend <a href="https://cursor.sh" target="_blank">Cursor</a>).</p>
<h3>First-time setup:</h3>
<ol>
    <li>Install <a href="https://git-scm.com/downloads" target="_blank">Git</a> if you haven't already</li>
    <li>Clone the repository:<pre><code>git clone https://github.com/RanMica/Arena.git
cd Arena</code></pre></li>
    <li>Start a local server:<pre><code>npx serve .</code></pre></li>
    <li>Open <code>http://localhost:3000</code> in your browser</li>
</ol>

<h2>Staying Up to Date</h2>
<p>Before starting any work, always pull the latest changes:</p>
<pre><code>git pull origin main</code></pre>
<p>This downloads everyone else's latest prototypes. Do this every time you sit down to work.</p>
<p><strong>If you see a merge conflict</strong> (usually in <code>prototypes.json</code>): open the file and keep both entries. The JSON array just needs all entries present.</p>

<h2>Creating a New Prototype</h2>
<ol>
    <li><strong>Add yourself to the team roster</strong> (one-time): Open <code>prototypes.json</code> and add your entry to the <code>"team"</code> array:<pre><code>{ "id": "your-name", "name": "Your Full Name", "role": "Designer", "email": "you@ridewithvia.com" }</code></pre></li>
    <li><strong>Click "New Prototype"</strong> in the hub dashboard, fill in the name and description, and click "Generate Instructions"</li>
    <li>Follow the generated instructions. They'll tell you exactly what to add to <code>prototypes.json</code> and which folder to create</li>
    <li>Build your prototype inside the folder (HTML/CSS/JS). Use Cursor AI to help!</li>
</ol>

<h2>Adding Variants to a Prototype</h2>
<p>You can create variants directly from the hub:</p>
<ol>
    <li>Open a prototype from the dashboard</li>
    <li>Click the <strong>+ New Variant</strong> button in the toolbar</li>
    <li>Name the variant and choose which existing variant to base it on</li>
    <li>Copy the generated command and run it in your terminal</li>
    <li>Edit the new variant files in the directory shown</li>
</ol>
<p>The script handles directory restructuring automatically if needed.</p>

<h2>Deleting a Variant</h2>
<p>Only the <strong>prototype creator</strong> can delete variants. When viewing a prototype with multiple variants, the creator sees a small × icon on each variant tab. Clicking it generates a terminal command to remove the variant.</p>
<p>You cannot delete the last remaining variant of a prototype.</p>

<h2>Duplicating a Prototype</h2>
<p>Want to build on someone else's work? Click the <strong>copy icon</strong> on any prototype card. This pre-fills the "New Prototype" form with the original's info. Change the name, set yourself as creator, and follow the instructions.</p>

<h2>Publishing Your Changes</h2>
<p>When you're done, commit and push:</p>
<pre><code>git add .
git commit -m "Add my-feature prototype"
git push origin main</code></pre>
<p>Your changes will be live on the hosted URL within a minute or two.</p>

<h2>Troubleshooting</h2>
<h3>My prototype doesn't show up on the dashboard</h3>
<p>Check that you added an entry to the <code>"prototypes"</code> array in <code>prototypes.json</code> and that the <code>"path"</code> points to a valid <code>index.html</code> file.</p>
<h3>I see an old version of someone else's prototype</h3>
<p>Run <code>git pull origin main</code> to get the latest changes.</p>
<h3>I get a permission error when pushing</h3>
<p>Ask the repo admin to add you as a collaborator on the GitHub repository.</p>
<h3>The prototype looks broken</h3>
<p>Make sure all file paths in your prototype are <strong>relative</strong> (e.g. <code>css/styles.css</code>, not <code>/css/styles.css</code>). Absolute paths will break inside the hub.</p>`;

        $('#guide-body').querySelectorAll('pre').forEach((pre) => {
            pre.style.position = 'relative';
            const btn = document.createElement('button');
            btn.className = 'guide-copy-btn';
            btn.textContent = 'Copy';
            btn.addEventListener('click', () => {
                navigator.clipboard.writeText(pre.textContent).then(() => {
                    btn.textContent = 'Copied!';
                    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
                });
            });
            pre.appendChild(btn);
        });
    }

    /* ===== Modal: New / Duplicate Prototype ===== */
    let selectedTemplate = null; // 'rider-management' | 'ride-plan' | 'booking-page' | 'import' | null (duplicate)

    function openNewModal() {
        selectedTemplate = null;
        $('#modal-title').textContent = 'New Prototype';
        showModalStep('pick');
        $('#modal-overlay').classList.add('open');
    }

    function openDuplicateModal(sourceId) {
        selectedTemplate = null;
        const proto = manifest.prototypes.find((p) => p.id === sourceId);
        if (!proto) return;
        showModalStep('details');
        $('#modal-title').textContent = 'Duplicate Prototype';
        $('#btn-modal-back').style.display = 'none';
        $('#modal-source-label').style.display = 'none';
        $('#import-path-row').style.display = 'none';
        $('#input-name').value = proto.name + ' — Copy';
        $('#input-description').value = proto.description;
        $('#input-creator').innerHTML = manifest.team
            .map((m) => `<option value="${m.id}">${m.name} (${m.role})</option>`).join('');
        $('#modal-overlay').classList.add('open');
    }

    function showModalStep(step) {
        $('#modal-step-pick').style.display   = step === 'pick'    ? '' : 'none';
        $('#modal-step-details').style.display = step === 'details' ? '' : 'none';
        $('#modal-footer').style.display       = step === 'details' ? 'flex' : 'none';
        $('#btn-modal-back').style.display     = step === 'details' ? '' : 'none';
        $('#modal-output').style.display = 'none';
        $('#modal-footer').style.display = step === 'details' ? 'flex' : 'none';
    }

    function pickTemplate(templateId) {
        selectedTemplate = templateId;
        showModalStep('details');

        // Source label
        const labels = {
            'rider-management': 'Rider Management template',
            'ride-plan': 'Ride Plan template',
            'booking-page': 'Booking Page template',
            'import': 'Import folder'
        };
        const sourceLabel = $('#modal-source-label');
        sourceLabel.textContent = `Starting from: ${labels[templateId] || templateId}`;
        sourceLabel.style.display = '';

        // Import path row
        const isImport = templateId === 'import';
        $('#import-path-row').style.display = isImport ? '' : 'none';
        $('#input-name').value = '';
        $('#input-description').value = '';
        $('#input-import-path').value = '';
        $('#input-creator').innerHTML = manifest.team
            .map((m) => `<option value="${m.id}">${m.name} (${m.role})</option>`).join('');

        // Pre-select current user
        if (currentUser) {
            const option = Array.from($('#input-creator').options).find(o => o.value === currentUser.id);
            if (option) option.selected = true;
        }

        $('#input-name').focus();
    }

    function resetModal() {
        selectedTemplate = null;
        showModalStep('pick');
        $('#input-name').value = '';
        $('#input-description').value = '';
        $('#input-import-path').value = '';
    }

    function closeModal() { $('#modal-overlay').classList.remove('open'); }

    function generateInstructions() {
        const name = $('#input-name').value.trim();
        const desc = $('#input-description').value.trim();
        const creatorId = $('#input-creator').value;

        if (!name) { $('#input-name').focus(); return; }

        let cmd = `cd "${HUB_ROOT}" && ./scripts/new-prototype.sh --name "${name}" --creator "${creatorId}"`;
        if (desc) cmd += ` --description "${desc}"`;

        if (selectedTemplate === 'import') {
            const importPath = $('#input-import-path').value.trim();
            if (!importPath) { $('#input-import-path').focus(); return; }
            cmd += ` --import-path "${importPath}"`;
        } else if (selectedTemplate) {
            cmd += ` --template "${selectedTemplate}"`;
        }

        $('#modal-output-code').textContent = cmd;
        $('#modal-output').style.display = 'block';
        $('#modal-footer').style.display = 'none';
    }

    function copyOutput() {
        navigator.clipboard.writeText($('#modal-output-code').textContent).then(() => {
            const btn = $('#btn-copy-output');
            btn.textContent = 'Copied!';
            setTimeout(() => (btn.textContent = 'Copy to Clipboard'), 2000);
        });
    }

    /* ===== Modal: Edit Prototype ===== */
    let editingProtoId = null;

    function openEditModal(protoId) {
        editingProtoId = protoId;
        const proto = manifest.prototypes.find(p => p.id === protoId);
        if (!proto) return;

        $('#edit-modal-title').textContent = `Edit — ${proto.name}`;
        $('#input-edit-name').value = proto.name;
        $('#input-edit-description').value = proto.description || '';
        $('#edit-modal-output').style.display = 'none';
        $('#edit-modal-footer').style.display = 'flex';
        $('#edit-modal-overlay').classList.add('open');
    }

    function closeEditModal() { $('#edit-modal-overlay').classList.remove('open'); }

    function generateEditProtoCommand() {
        const name = $('#input-edit-name').value.trim();
        if (!name) { $('#input-edit-name').focus(); return; }
        const desc = $('#input-edit-description').value.trim();

        const parts = [`cd "${HUB_ROOT}" && ./scripts/edit-prototype.sh ${editingProtoId}`];
        const proto = manifest.prototypes.find(p => p.id === editingProtoId);

        if (name !== (proto?.name || '')) parts.push(`--name "${name}"`);
        if (desc !== (proto?.description || '')) parts.push(`--description "${desc}"`);

        if (parts.length === 1) {
            closeEditModal();
            return;
        }

        const cmd = parts.join(' ');
        $('#edit-modal-output-code').textContent = cmd;
        $('#edit-modal-output').style.display = 'block';
        $('#edit-modal-footer').style.display = 'none';
    }

    function copyEditOutput() {
        navigator.clipboard.writeText($('#edit-modal-output-code').textContent).then(() => {
            const btn = $('#btn-edit-copy-output');
            btn.textContent = 'Copied!';
            setTimeout(() => (btn.textContent = 'Copy to Clipboard'), 2000);
        });
    }

    /* ===== Modal: New Variant ===== */
    let variantModalProtoId = null;

    function openVariantModalFor(protoId) {
        variantModalProtoId = protoId;
        const proto = manifest.prototypes.find(p => p.id === protoId);
        if (!proto) return;

        $('#variant-modal-title').textContent = `New Variant — ${proto.name}`;
        $('#input-variant-name').value = '';
        $('#input-variant-description').value = '';
        $('#variant-modal-output').style.display = 'none';
        $('#variant-modal-footer').style.display = 'flex';

        const select = $('#input-variant-source');
        select.innerHTML = proto.variants
            .map(v => `<option value="${v.id}">${v.name}</option>`)
            .join('');

        $('#variant-modal-overlay').classList.add('open');
    }

    function openVariantModal() {
        openVariantModalFor(currentProtoId);
    }

    function closeVariantModal() { $('#variant-modal-overlay').classList.remove('open'); }

    function generateVariantCommand() {
        const name = $('#input-variant-name').value.trim();
        if (!name) { $('#input-variant-name').focus(); return; }

        const desc = $('#input-variant-description').value.trim();
        const sourceId = $('#input-variant-source').value;
        const protoId = variantModalProtoId || currentProtoId;
        let cmd = `cd "${HUB_ROOT}" && ./scripts/new-variant.sh ${protoId} "${name}" ${sourceId}`;
        if (desc) cmd += ` --description "${desc}"`;

        $('#variant-modal-output-code').textContent = cmd;
        $('#variant-modal-output').style.display = 'block';
        $('#variant-modal-footer').style.display = 'none';
    }

    function copyVariantOutput() {
        navigator.clipboard.writeText($('#variant-modal-output-code').textContent).then(() => {
            const btn = $('#btn-variant-copy-output');
            btn.textContent = 'Copied!';
            setTimeout(() => (btn.textContent = 'Copy to Clipboard'), 2000);
        });
    }

    /* ===== Team Modal ===== */
    let editingMemberEmail = null;

    function openTeamViewModal() {
        renderPendingRequests();
        renderTeamList();
        $('#team-view-overlay').classList.add('open');
    }

    function closeTeamViewModal() {
        $('#team-view-overlay').classList.remove('open');
    }

    function renderTeamList() {
        const list = $('#team-list');
        list.innerHTML = manifest.team.map(m => {
            const color = avatarColor(m.name);
            const access = m.access || (m.admin ? 'admin' : 'editor');
            const badgeColor = access === 'admin' ? '#0069e2' : access === 'viewer' ? '#6b7280' : '#16a34a';
            const accessBadge = `<span class="admin-badge" style="background:${badgeColor}20;color:${badgeColor};border:1px solid ${badgeColor}40">${access.charAt(0).toUpperCase() + access.slice(1)}</span>`;
            return `
            <div class="team-member-card" data-email="${m.email}">
                <div class="team-member-info">
                    <div class="avatar" style="background:${color}">${initials(m.name)}</div>
                    <div class="team-member-details">
                        <div class="team-member-name">${m.name} ${accessBadge}</div>
                        <div class="team-member-email">${m.email}</div>
                        <div class="team-member-role">${m.role || '—'}</div>
                    </div>
                </div>
                <div class="team-member-actions">
                    <button class="hub-btn hub-btn-ghost btn-edit-member" data-email="${m.email}">Edit</button>
                    <button class="hub-btn hub-btn-ghost btn-remove-member" data-email="${m.email}" style="color:#dc2626">Remove</button>
                </div>
            </div>`;
        }).join('');

        list.querySelectorAll('.btn-edit-member').forEach(btn => {
            btn.addEventListener('click', () => openEditMemberModal(btn.dataset.email));
        });
        list.querySelectorAll('.btn-remove-member').forEach(btn => {
            btn.addEventListener('click', () => showRemoveMemberCommand(btn.dataset.email));
        });
    }

    function openAddMemberModal() {
        editingMemberEmail = null;
        $('#team-modal-title').textContent = 'Add Team Member';
        $('#input-member-name').value = '';
        $('#input-member-email').value = '';
        $('#input-member-email').disabled = false;
        $('#input-member-role').value = '';
        $('#input-member-access').value = 'editor';
        $('#team-modal-output').style.display = 'none';
        $('#team-modal-footer').style.display = 'flex';
        $('#btn-team-modal-generate').textContent = 'Generate Command';
        $('#team-modal-overlay').classList.add('open');
    }

    function openEditMemberModal(email) {
        const member = manifest.team.find(m => m.email === email);
        if (!member) return;
        editingMemberEmail = email;
        $('#team-modal-title').textContent = 'Edit Team Member';
        $('#input-member-name').value = member.name;
        $('#input-member-email').value = member.email;
        $('#input-member-email').disabled = true;
        $('#input-member-role').value = member.role || '';
        $('#input-member-access').value = member.access || (member.admin ? 'admin' : 'editor');
        $('#team-modal-output').style.display = 'none';
        $('#team-modal-footer').style.display = 'flex';
        $('#btn-team-modal-generate').textContent = 'Generate Command';
        $('#team-modal-overlay').classList.add('open');
    }

    function closeTeamModal() {
        $('#team-modal-overlay').classList.remove('open');
    }

    function generateTeamCommand() {
        if (editingMemberEmail) {
            generateEditCommand();
        } else {
            generateAddCommand();
        }
    }

    function generateAddCommand() {
        const name = $('#input-member-name').value.trim();
        const email = $('#input-member-email').value.trim().toLowerCase();
        const role = $('#input-member-role').value.trim();
        const access = $('#input-member-access').value;

        if (!name) { $('#input-member-name').focus(); return; }
        if (!email) { $('#input-member-email').focus(); return; }

        let cmd = `cd "${HUB_ROOT}" && ./scripts/team.sh add --name "${name}" --email "${email}"`;
        if (role) cmd += ` --role "${role}"`;
        cmd += ` --access ${access}`;

        $('#team-modal-output-code').textContent = cmd;
        $('#team-modal-output').style.display = 'block';
        $('#team-modal-footer').style.display = 'none';
    }

    function generateEditCommand() {
        const name = $('#input-member-name').value.trim();
        const role = $('#input-member-role').value.trim();
        const access = $('#input-member-access').value;
        const member = manifest.team.find(m => m.email === editingMemberEmail);
        if (!member) return;

        const currentAccess = member.access || (member.admin ? 'admin' : 'editor');
        const parts = [`cd "${HUB_ROOT}" && ./scripts/team.sh edit --email "${editingMemberEmail}"`];
        if (name && name !== member.name) parts.push(`--name "${name}"`);
        if (role !== (member.role || '')) parts.push(`--role "${role}"`);
        if (access !== currentAccess) parts.push(`--access ${access}`);

        if (parts.length === 1) {
            alert('No changes detected.');
            return;
        }

        const cmd = parts.join(' ');
        $('#team-modal-output-code').textContent = cmd;
        $('#team-modal-output').style.display = 'block';
        $('#team-modal-footer').style.display = 'none';
    }

    function showRemoveMemberCommand(email) {
        const member = manifest.team.find(m => m.email === email);
        if (!member) return;
        const cmd = `cd "${HUB_ROOT}" && ./scripts/team.sh remove --email "${email}"`;
        const confirmed = confirm(
            `Remove "${member.name}" (${email}) from the team?\n\nRun this command in your terminal:\n${cmd}`
        );
        if (confirmed) {
            navigator.clipboard.writeText(cmd).then(() => {
                alert(`Command copied to clipboard:\n\n${cmd}\n\nRun it in your terminal, then reload the hub.`);
            }).catch(() => {
                prompt('Copy this command and run it in your terminal:', cmd);
            });
        }
    }

    function copyTeamOutput() {
        navigator.clipboard.writeText($('#team-modal-output-code').textContent).then(() => {
            const btn = $('#btn-team-copy-output');
            btn.textContent = 'Copied!';
            setTimeout(() => (btn.textContent = 'Copy to Clipboard'), 2000);
        });
    }

    /* ===== Init ===== */
    async function init() {
        try {
            arenaConfig = await (await fetch('arena.config.json')).json();
        } catch { /* defaults are fine */ }

        try {
            manifest = await (await fetch('prototypes.json')).json();
        } catch (e) {
            console.error('Failed to load prototypes.json:', e);
        }

        if (isHubMode()) {
            activeSpace = 'hub';
        }

        resolveCurrentUser();
        applyModeUI();

        // Space toggle
        $$('#space-toggle .space-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => switchSpace(btn.dataset.space));
        });

        $('#btn-new-prototype').addEventListener('click', openNewModal);
        $('#btn-how-it-works').addEventListener('click', openGuideModal);
        $('#guide-modal-close').addEventListener('click', closeGuideModal);
        $('#modal-close').addEventListener('click', closeModal);
        $('#btn-modal-cancel').addEventListener('click', closeModal);
        $('#btn-modal-generate').addEventListener('click', generateInstructions);
        $('#btn-copy-output').addEventListener('click', copyOutput);
        $('#btn-modal-back').addEventListener('click', () => {
            selectedTemplate = null;
            showModalStep('pick');
            $('#modal-title').textContent = 'New Prototype';
        });
        document.querySelectorAll('.template-tile:not([disabled])').forEach(tile => {
            tile.addEventListener('click', () => pickTemplate(tile.dataset.template));
        });

        // Edit prototype modal
        $('#edit-modal-close').addEventListener('click', closeEditModal);
        $('#btn-edit-cancel').addEventListener('click', closeEditModal);
        $('#btn-edit-generate').addEventListener('click', generateEditProtoCommand);
        $('#btn-edit-copy-output').addEventListener('click', copyEditOutput);

        // Side panel
        $('#sp-tab').addEventListener('click', () => {
            if ($('#sp-drawer').classList.contains('open')) closeSidePanel();
            else openSidePanel();
        });
        $('#sp-close').addEventListener('click', closeSidePanel);
        $('#sp-how-it-works').addEventListener('click', () => {
            renderGuide();
            openGuideModal();
        });
        $('#sp-back').addEventListener('click', () => {
            closeSidePanel();
            const iframe = $('#prototype-iframe');
            iframe.classList.add('fade-out');
            setTimeout(() => {
                iframe.src = 'about:blank';
                iframe.classList.remove('fade-out');
                navigate('#/');
            }, 200);
        });

        // Sidebar profile
        $('#sp-profile').addEventListener('click', handleIdentityClick);

        // Delete variant modal
        $('#delete-modal-close').addEventListener('click', closeDeleteModal);
        $('#btn-delete-cancel').addEventListener('click', closeDeleteModal);
        $('#btn-delete-confirm').addEventListener('click', confirmDeleteVariant);
        $('#btn-delete-copy-output').addEventListener('click', copyDeleteOutput);
        $('#variant-modal-close').addEventListener('click', closeVariantModal);
        $('#btn-variant-cancel').addEventListener('click', closeVariantModal);
        $('#btn-variant-generate').addEventListener('click', generateVariantCommand);
        $('#btn-variant-copy-output').addEventListener('click', copyVariantOutput);

        // Publish modal
        $('#publish-modal-close').addEventListener('click', closePublishModal);
        $('#btn-publish-cancel').addEventListener('click', closePublishModal);
        $('#btn-publish-confirm').addEventListener('click', confirmPublish);
        $('#btn-publish-copy-output').addEventListener('click', copyPublishOutput);

        // Identity
        $('#identity-save-btn').addEventListener('click', handleIdentitySave);
        $('#identity-email-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleIdentitySave();
        });
        $('#identity-indicator').addEventListener('click', handleIdentityClick);
        $('#identity-modal-close').addEventListener('click', closeIdentityModal);
        $('#btn-identity-cancel').addEventListener('click', closeIdentityModal);
        $('#btn-identity-switch').addEventListener('click', switchUser);

        // Profile modal actions
        $('#profile-theme-toggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'dark' ? 'light' : 'dark');
            syncProfileThemeSwitch();
        });
        $('#profile-manage-team').addEventListener('click', () => {
            closeIdentityModal();
            openTeamViewModal();
        });
        $('#profile-upload-photo').addEventListener('click', () => {
            $('#profile-photo-input').click();
        });
        $('#profile-photo-input').addEventListener('change', handlePhotoUpload);
        $('#profile-remove-photo').addEventListener('click', handlePhotoRemove);

        // Team modals
        $('#team-view-close').addEventListener('click', closeTeamViewModal);
        $('#btn-add-member').addEventListener('click', openAddMemberModal);
        $('#team-modal-close').addEventListener('click', closeTeamModal);
        $('#btn-team-modal-cancel').addEventListener('click', closeTeamModal);
        $('#btn-team-modal-generate').addEventListener('click', generateTeamCommand);
        $('#btn-team-copy-output').addEventListener('click', copyTeamOutput);

        // Close modals on backdrop click
        $('#modal-overlay').addEventListener('click', (e) => {
            if (e.target === $('#modal-overlay')) closeModal();
        });
        $('#variant-modal-overlay').addEventListener('click', (e) => {
            if (e.target === $('#variant-modal-overlay')) closeVariantModal();
        });
        $('#guide-modal-overlay').addEventListener('click', (e) => {
            if (e.target === $('#guide-modal-overlay')) closeGuideModal();
        });
        $('#team-view-overlay').addEventListener('click', (e) => {
            if (e.target === $('#team-view-overlay')) closeTeamViewModal();
        });
        $('#team-modal-overlay').addEventListener('click', (e) => {
            if (e.target === $('#team-modal-overlay')) closeTeamModal();
        });
        $('#edit-modal-overlay').addEventListener('click', (e) => {
            if (e.target === $('#edit-modal-overlay')) closeEditModal();
        });
        $('#delete-modal-overlay').addEventListener('click', (e) => {
            if (e.target === $('#delete-modal-overlay')) closeDeleteModal();
        });
        $('#publish-modal-overlay').addEventListener('click', (e) => {
            if (e.target === $('#publish-modal-overlay')) closePublishModal();
        });
        $('#identity-modal-overlay').addEventListener('click', (e) => {
            if (e.target === $('#identity-modal-overlay')) closeIdentityModal();
        });

        window.addEventListener('hashchange', handleRoute);
        handleRoute();
    }

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init)
        : init();
})();
