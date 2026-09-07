const SCROLL_MILESTONES = [25, 50, 75, 90];
const ENGAGEMENT_MILESTONES_SECONDS = [10, 30, 60, 120];
const IDLE_AFTER_MS = 30_000;
const HEARTBEAT_MS = 15_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function initAnalytics() {
    if (window.__portfolioAnalyticsInitialized) return;
    window.__portfolioAnalyticsInitialized = true;

    const isLocalPreview = LOCAL_HOSTS.has(window.location.hostname);
    const debugMode = new URLSearchParams(window.location.search).has('ga_debug');

    // Keep local preview traffic out of production reports. Add ?ga_debug=1 when
    // intentionally validating events in GA4 DebugView.
    if (isLocalPreview && !debugMode) return;

    const pageStartedAt = performance.now();
    const sections = [...document.querySelectorAll('[id].intro, section[id]')];
    const state = {
        lastTickAt: pageStartedAt,
        lastActivityAt: pageStartedAt,
        engagementSinceEventMs: 0,
        totalEngagementMs: 0,
        activeSectionId: '',
        activeSectionMs: 0,
        viewedSections: new Set(),
        scrollMilestones: new Set(),
        engagementMilestones: new Set(),
        firstInteractionSent: false,
        summarySent: false,
        vitalsSent: false,
        maxScrollPercent: 0,
        interactionCount: 0,
        scrollFrame: 0,
        isVisible: document.visibilityState === 'visible'
    };

    const vitals = { cls: 0, fcpMs: 0, lcpMs: 0, inpMs: 0 };

    function captureEngagement(now = performance.now()) {
        const activeUntil = Math.min(now, state.lastActivityAt + IDLE_AFTER_MS);
        const elapsed = state.isVisible
            ? Math.max(0, activeUntil - state.lastTickAt)
            : 0;
        if (elapsed > 0) {
            state.engagementSinceEventMs += elapsed;
            state.totalEngagementMs += elapsed;
            if (state.activeSectionId) state.activeSectionMs += elapsed;
        }
        state.lastTickAt = now;
    }

    function sendEvent(eventName, parameters = {}) {
        captureEngagement();
        const payload = sanitizeParameters({
            ...parameters,
            engagement_time_msec: Math.max(1, Math.round(state.engagementSinceEventMs)),
            page_type: getPageType(),
            debug_mode: debugMode || undefined
        });
        state.engagementSinceEventMs = 0;

        if (typeof window.gtag === 'function') {
            window.gtag('event', eventName, payload);
        } else if (Array.isArray(window.dataLayer)) {
            window.dataLayer.push({ event: eventName, ...payload });
        }

        if (debugMode) {
            window.__portfolioAnalyticsDebug = window.__portfolioAnalyticsDebug || [];
            window.__portfolioAnalyticsDebug.push({ event: eventName, ...payload });
        }
    }

    function markActivity() {
        const now = performance.now();
        captureEngagement(now);
        state.lastActivityAt = now;
    }

    function sendFirstInteraction(inputMethod) {
        if (state.firstInteractionSent) return;
        state.firstInteractionSent = true;
        sendEvent('first_interaction', {
            input_method: inputMethod,
            time_to_interaction_msec: Math.round(performance.now() - pageStartedAt),
            section_name: state.activeSectionId || 'none'
        });
    }

    function getCurrentSectionId() {
        if (!sections.length) return 'page';
        const viewportMarker = window.innerHeight * 0.42;
        let bestSection = sections[0];
        let bestDistance = Number.POSITIVE_INFINITY;

        sections.forEach((section) => {
            const rect = section.getBoundingClientRect();
            if (rect.top <= viewportMarker && rect.bottom >= viewportMarker) {
                bestSection = section;
                bestDistance = 0;
                return;
            }
            const distance = Math.min(
                Math.abs(rect.top - viewportMarker),
                Math.abs(rect.bottom - viewportMarker)
            );
            if (distance < bestDistance) {
                bestDistance = distance;
                bestSection = section;
            }
        });
        return bestSection.id || 'page';
    }

    function beginSection(sectionId) {
        if (!sectionId || sectionId === state.activeSectionId) return;
        flushSectionEngagement();
        state.activeSectionId = sectionId;
        state.activeSectionMs = 0;

        if (!state.viewedSections.has(sectionId)) {
            state.viewedSections.add(sectionId);
            sendEvent('section_view', {
                section_name: sectionId,
                time_to_view_msec: Math.round(performance.now() - pageStartedAt)
            });
        }
    }

    function flushSectionEngagement(transportType) {
        captureEngagement();
        if (!state.activeSectionId || state.activeSectionMs < 1_000) return;
        const sectionName = state.activeSectionId;
        const sectionTime = Math.round(state.activeSectionMs);
        state.activeSectionMs = 0;
        sendEvent('section_engagement', {
            section_name: sectionName,
            section_time_msec: sectionTime,
            transport_type: transportType
        });
    }

    function updateScrollMeasurements() {
        state.scrollFrame = 0;
        markActivity();
        const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = scrollableHeight <= 0
            ? 100
            : Math.min(100, Math.round((window.scrollY / scrollableHeight) * 100));
        state.maxScrollPercent = Math.max(state.maxScrollPercent, scrollPercent);

        SCROLL_MILESTONES.forEach((milestone) => {
            if (scrollPercent < milestone || state.scrollMilestones.has(milestone)) return;
            state.scrollMilestones.add(milestone);
            sendEvent('scroll_depth', { percent_scrolled: milestone });
        });
        beginSection(getCurrentSectionId());
    }

    function scheduleScrollMeasurement() {
        if (!state.scrollFrame) {
            state.scrollFrame = requestAnimationFrame(updateScrollMeasurements);
        }
    }

    function getProjectId(link) {
        const card = link.closest('.project-card');
        const title = card?.querySelector('h3')?.textContent
            || document.querySelector('.project-title')?.textContent;
        return slugify(title || 'unknown-project');
    }

    function getLinkContext(link) {
        const rawHref = link.getAttribute('href') || '';
        if (rawHref.startsWith('mailto:')) return { type: 'contact', method: 'email' };
        if (rawHref.startsWith('tel:')) return { type: 'contact', method: 'phone' };

        let url;
        try {
            url = new URL(rawHref, window.location.href);
        } catch {
            return { type: 'unknown' };
        }

        const domain = url.hostname.replace(/^www\./, '');
        const socialMethod = getSocialMethod(domain);
        if (socialMethod) return { type: 'contact', method: socialMethod };
        if (link.closest('.project-card') || link.classList.contains('project-link-btn')) {
            return {
                type: 'project',
                projectId: getProjectId(link),
                destination: domain || 'internal',
                linkKind: getProjectLinkKind(link, url)
            };
        }
        if (url.origin !== window.location.origin) {
            return { type: 'outbound', domain, path: url.pathname };
        }
        if (url.hash) return { type: 'internal', destination: url.hash.slice(1) || 'top' };
        return { type: 'internal', destination: url.pathname };
    }

    function trackLinkClick(link) {
        const context = getLinkContext(link);
        const sectionName = link.closest('section[id], [id].intro')?.id
            || state.activeSectionId
            || 'none';
        const common = {
            section_name: sectionName,
            time_to_action_msec: Math.round(performance.now() - pageStartedAt),
            active_time_before_action_msec: Math.round(state.totalEngagementMs)
        };

        if (context.type === 'project') {
            sendEvent('select_content', {
                ...common,
                content_type: 'project',
                content_id: context.projectId,
                link_kind: context.linkKind,
                destination_domain: context.destination
            });
        } else if (context.type === 'contact') {
            sendEvent('contact_click', { ...common, method: context.method });
        } else if (context.type === 'outbound') {
            sendEvent('outbound_click', {
                ...common,
                link_domain: context.domain,
                link_path: context.path
            });
        } else if (context.type === 'internal') {
            sendEvent('internal_navigation', {
                ...common,
                destination: context.destination
            });
        }
    }

    function trackEngagementMilestones() {
        captureEngagement();
        const engagedSeconds = Math.floor(state.totalEngagementMs / 1000);
        ENGAGEMENT_MILESTONES_SECONDS.forEach((milestone) => {
            if (engagedSeconds < milestone || state.engagementMilestones.has(milestone)) return;
            state.engagementMilestones.add(milestone);
            sendEvent('engagement_milestone', {
                milestone_seconds: milestone,
                active_section: state.activeSectionId || 'none',
                max_scroll_percent: state.maxScrollPercent
            });
        });
    }

    function sendProjectView() {
        const projectTitle = document.querySelector('.project-title')?.textContent;
        if (!projectTitle) return;
        sendEvent('project_view', {
            project_id: slugify(projectTitle),
            time_to_view_msec: Math.round(performance.now() - pageStartedAt)
        });
    }

    function observeWebVitals() {
        if (typeof PerformanceObserver === 'undefined') return;
        const supported = PerformanceObserver.supportedEntryTypes || [];
        observePerformanceType(supported, 'paint', (entry) => {
            if (entry.name === 'first-contentful-paint') vitals.fcpMs = entry.startTime;
        });
        observePerformanceType(supported, 'largest-contentful-paint', (entry) => {
            vitals.lcpMs = entry.startTime;
        });
        observePerformanceType(supported, 'layout-shift', (entry) => {
            if (!entry.hadRecentInput) vitals.cls += entry.value;
        });
        observePerformanceType(supported, 'event', (entry) => {
            vitals.inpMs = Math.max(vitals.inpMs, entry.duration || 0);
        }, { durationThreshold: 40 });
    }

    function sendWebVitals() {
        if (state.vitalsSent) return;
        state.vitalsSent = true;
        sendEvent('web_vitals_summary', {
            fcp_msec: Math.round(vitals.fcpMs),
            lcp_msec: Math.round(vitals.lcpMs),
            cls_score: Number(vitals.cls.toFixed(4)),
            inp_msec: Math.round(vitals.inpMs),
            transport_type: 'beacon'
        });
    }

    function sendSessionSummary() {
        if (state.summarySent) return;
        state.summarySent = true;
        captureEngagement();
        flushSectionEngagement('beacon');
        sendEvent('session_summary', {
            active_time_msec: Math.round(state.totalEngagementMs),
            elapsed_time_msec: Math.round(performance.now() - pageStartedAt),
            interaction_count: state.interactionCount,
            sections_viewed: state.viewedSections.size,
            max_scroll_percent: state.maxScrollPercent,
            transport_type: 'beacon'
        });
        sendWebVitals();
    }

    document.addEventListener('pointerdown', markActivity, { passive: true, capture: true });
    document.addEventListener('touchstart', markActivity, { passive: true, capture: true });
    document.addEventListener('keydown', (event) => {
        markActivity();
        sendFirstInteraction('keyboard');
    }, { capture: true });
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a');
        if (!link) return;
        markActivity();
        state.interactionCount += 1;
        sendFirstInteraction(event.detail === 0 ? 'keyboard' : 'pointer');
        trackLinkClick(link);
    }, { capture: true });
    window.addEventListener('scroll', scheduleScrollMeasurement, { passive: true });
    window.addEventListener('focus', markActivity);
    document.addEventListener('visibilitychange', () => {
        captureEngagement();
        state.isVisible = document.visibilityState === 'visible';
        state.lastTickAt = performance.now();
        if (state.isVisible) state.lastActivityAt = state.lastTickAt;
    });
    window.addEventListener('pagehide', sendSessionSummary, { once: true });

    const heartbeat = window.setInterval(trackEngagementMilestones, HEARTBEAT_MS);
    window.addEventListener('pagehide', () => window.clearInterval(heartbeat), { once: true });

    observeWebVitals();
    beginSection(getCurrentSectionId());
    updateScrollMeasurements();
    sendProjectView();
}

function observePerformanceType(supportedTypes, type, onEntry, options = {}) {
    if (!supportedTypes.includes(type)) return;
    try {
        const observer = new PerformanceObserver((list) => list.getEntries().forEach(onEntry));
        observer.observe({ type, buffered: true, ...options });
    } catch {
        // Performance observers vary by browser; analytics should never break the page.
    }
}

function getProjectLinkKind(link, url) {
    const label = (link.textContent || '').toLowerCase();
    if (label.includes('source') || url.hostname.includes('github.com')) return 'source';
    if (label.includes('live') || label.includes('visit')) return 'live';
    if (url.origin === window.location.origin) return 'details';
    return 'external';
}

function getSocialMethod(domain) {
    if (domain.includes('linkedin.com')) return 'linkedin';
    if (domain.includes('github.com')) return 'github';
    if (domain.includes('twitter.com') || domain.includes('x.com')) return 'twitter';
    return '';
}

function getPageType() {
    if (document.querySelector('.project-title')) return 'project_detail';
    if (document.querySelector('#projects')) return 'home';
    return 'other';
}

function slugify(value) {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
}

function sanitizeParameters(parameters) {
    const sanitized = {};
    Object.entries(parameters).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        if (typeof value === 'string') {
            sanitized[key.slice(0, 40)] = value.slice(0, 100);
        } else if (typeof value === 'number' && Number.isFinite(value)) {
            sanitized[key.slice(0, 40)] = value;
        } else if (typeof value === 'boolean') {
            sanitized[key.slice(0, 40)] = value;
        }
    });
    return sanitized;
}
