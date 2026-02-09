let analyticsSessionId = '';

const SCROLL_MILESTONES = [25, 50, 75, 90, 100];
const ENGAGEMENT_MILESTONES_SEC = [10, 30, 60, 120, 300];
const DOWNLOADABLE_EXTENSIONS = new Set([
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', 'csv', 'txt', 'json', 'mp4', 'mov'
]);

export function initAnalytics() {
    if (window.__portfolioAnalyticsInitialized) {
        return;
    }
    window.__portfolioAnalyticsInitialized = true;

    analyticsSessionId = createSessionId();

    const state = {
        sessionStartedAt: Date.now(),
        visibleStartedAt: document.visibilityState === 'visible' ? Date.now() : null,
        engagedMs: 0,
        maxScrollPercent: 0,
        firedScrollMilestones: new Set(),
        firedEngagementMilestones: new Set(),
        lastSelectionSignature: '',
        lastSelectionTrackedAt: 0,
        clickHistory: [],
        lastRageClickTrackedAt: 0,
        interactionCount: 0,
        sectionViews: new Set(),
        firstInteractionTracked: false,
        activeInputMethod: detectInitialInputMethod(),
        webVitalsReported: false,
        formsStarted: new WeakSet(),
        fieldsFocused: new WeakSet()
    };

    const hoverTimers = new WeakMap();
    const trackedHoverElements = new WeakSet();
    let selectionDebounceTimer;

    const vitals = {
        cls: 0,
        lcp: 0,
        inp: 0,
        inpType: '',
        longTaskCount: 0,
        maxLongTaskMs: 0,
        fcp: 0,
        ttfb: 0
    };

    function flushVisibleEngagement() {
        if (state.visibleStartedAt === null) {
            return;
        }
        state.engagedMs += Date.now() - state.visibleStartedAt;
        state.visibleStartedAt = null;
    }

    function getEngagedSeconds() {
        let totalEngagedMs = state.engagedMs;
        if (state.visibleStartedAt !== null) {
            totalEngagedMs += Date.now() - state.visibleStartedAt;
        }
        return Math.round(totalEngagedMs / 1000);
    }

    function getTotalSessionSeconds() {
        return Math.round((Date.now() - state.sessionStartedAt) / 1000);
    }

    function trackEngagementMilestones() {
        const engagedSeconds = getEngagedSeconds();
        ENGAGEMENT_MILESTONES_SEC.forEach((milestone) => {
            if (engagedSeconds >= milestone && !state.firedEngagementMilestones.has(milestone)) {
                state.firedEngagementMilestones.add(milestone);
                trackEvent('engagement_milestone', {
                    milestone_sec: milestone,
                    interaction_count: state.interactionCount,
                    max_scroll_percent: state.maxScrollPercent
                });
            }
        });
    }

    function reportWebVitalsSummary() {
        if (state.webVitalsReported) {
            return;
        }
        state.webVitalsReported = true;

        trackEvent('web_vitals_summary', {
            lcp_ms: Math.round(vitals.lcp),
            cls: roundNumber(vitals.cls, 4),
            inp_ms: Math.round(vitals.inp),
            inp_type: vitals.inpType || 'unknown',
            fcp_ms: Math.round(vitals.fcp),
            ttfb_ms: Math.round(vitals.ttfb),
            long_task_count: vitals.longTaskCount,
            max_long_task_ms: Math.round(vitals.maxLongTaskMs)
        });
    }

    function maybeTrackFirstInteraction(eventType, target) {
        if (state.firstInteractionTracked) {
            return;
        }
        state.firstInteractionTracked = true;
        const delayMs = Math.max(0, Date.now() - state.sessionStartedAt);
        trackEvent('first_interaction', {
            interaction_type: eventType,
            first_interaction_delay_ms: delayMs,
            section_id: getSectionIdForElement(target) || 'none'
        });
    }

    function trackClickDetails(target) {
        const sectionId = getSectionIdForElement(target) || 'none';
        const label = getElementLabel(target);
        trackEvent('ui_click', {
            section_id: sectionId,
            element_tag: target.tagName.toLowerCase(),
            element_label: label,
            element_class: normalizeClassName(target.className),
            input_method: state.activeInputMethod
        });
    }

    function parseLinkMetadata(link) {
        const rawHref = (link.getAttribute('href') || '').trim();
        const isNewTab = link.getAttribute('target') === '_blank';

        if (!rawHref || rawHref === '#') {
            return {
                type: 'empty',
                rawHref,
                isNewTab,
                destinationDomain: '',
                destinationPath: ''
            };
        }

        if (rawHref.startsWith('mailto:')) {
            const emailAddress = rawHref.replace('mailto:', '').trim();
            const emailDomain = emailAddress.includes('@') ? emailAddress.split('@')[1].toLowerCase() : 'unknown';
            return {
                type: 'contact_email',
                rawHref,
                isNewTab,
                destinationDomain: emailDomain,
                destinationPath: ''
            };
        }

        if (rawHref.startsWith('tel:')) {
            return {
                type: 'contact_phone',
                rawHref,
                isNewTab,
                destinationDomain: 'phone',
                destinationPath: ''
            };
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(rawHref, window.location.href);
        } catch {
            return {
                type: 'invalid',
                rawHref,
                isNewTab,
                destinationDomain: '',
                destinationPath: ''
            };
        }

        const destinationDomain = parsedUrl.hostname.replace(/^www\./, '');
        const destinationPath = parsedUrl.pathname || '/';
        const extensionMatch = destinationPath.match(/\.([a-zA-Z0-9]+)$/);
        const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
        const isDownload = extension ? DOWNLOADABLE_EXTENSIONS.has(extension) : false;
        const socialMethod = getSocialMethod(destinationDomain);

        if (socialMethod) {
            return {
                type: 'contact_social',
                method: socialMethod,
                rawHref,
                isNewTab,
                destinationDomain,
                destinationPath,
                fileExtension: extension
            };
        }

        if (isDownload) {
            return {
                type: 'download',
                rawHref,
                isNewTab,
                destinationDomain,
                destinationPath,
                fileExtension: extension
            };
        }

        if (parsedUrl.hostname === window.location.hostname) {
            if (parsedUrl.pathname === window.location.pathname && parsedUrl.hash) {
                return {
                    type: 'internal_anchor',
                    rawHref,
                    isNewTab,
                    destinationDomain,
                    destinationPath,
                    hash: parsedUrl.hash.replace('#', '')
                };
            }

            return {
                type: 'internal_navigation',
                rawHref,
                isNewTab,
                destinationDomain,
                destinationPath
            };
        }

        return {
            type: 'outbound',
            rawHref,
            isNewTab,
            destinationDomain,
            destinationPath
        };
    }

    function trackLinkDetails(link) {
        const metadata = parseLinkMetadata(link);
        if (!metadata || metadata.type === 'empty') {
            return;
        }

        trackEvent('link_click', {
            link_type: metadata.type,
            destination_domain: metadata.destinationDomain || 'none',
            destination_path: metadata.destinationPath || 'none',
            open_new_tab: metadata.isNewTab,
            link_text: getElementLabel(link),
            section_id: getSectionIdForElement(link) || 'none'
        });

        if (metadata.type === 'contact_email' || metadata.type === 'contact_phone') {
            trackEvent('contact_method_click', {
                method: metadata.type === 'contact_email' ? 'email' : 'phone',
                destination_domain: metadata.destinationDomain || 'none'
            });
            return;
        }

        if (metadata.type === 'contact_social') {
            trackEvent('contact_method_click', {
                method: metadata.method || 'social',
                destination_domain: metadata.destinationDomain || 'none'
            });
            return;
        }

        if (metadata.type === 'download') {
            trackEvent('file_download_click', {
                file_ext: metadata.fileExtension || 'unknown',
                destination_domain: metadata.destinationDomain || 'none'
            });
            return;
        }

        if (metadata.type === 'outbound') {
            trackEvent('outbound_link_click', {
                destination_domain: metadata.destinationDomain || 'none',
                destination_path: metadata.destinationPath || 'none'
            });
            return;
        }

        if (metadata.type === 'internal_anchor') {
            trackEvent('internal_anchor_click', {
                target_anchor: metadata.hash || 'unknown'
            });
        }
    }

    function maybeTrackRageClick(clickEvent, target) {
        const now = Date.now();
        const x = clickEvent.clientX;
        const y = clickEvent.clientY;

        state.clickHistory = state.clickHistory.filter((point) => now - point.t <= 1200);
        state.clickHistory.push({ x, y, t: now });

        const nearbyClicks = state.clickHistory.filter((point) => {
            const distance = Math.hypot(point.x - x, point.y - y);
            return distance <= 24;
        });

        if (nearbyClicks.length >= 3 && now - state.lastRageClickTrackedAt > 1500) {
            state.lastRageClickTrackedAt = now;
            trackEvent('rage_click', {
                section_id: getSectionIdForElement(target) || 'none',
                element_class: normalizeClassName(target.className),
                input_method: state.activeInputMethod
            });
        }
    }

    function initSectionViewTracking() {
        const sections = document.querySelectorAll('section[id]');
        if (!sections.length || typeof IntersectionObserver === 'undefined') {
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }
                const sectionId = entry.target.id;
                if (state.sectionViews.has(sectionId)) {
                    return;
                }
                state.sectionViews.add(sectionId);
                trackEvent('section_view', {
                    section_id: sectionId,
                    viewed_after_sec: getTotalSessionSeconds()
                });
            });
        }, {
            threshold: 0.55
        });

        sections.forEach((section) => observer.observe(section));
    }

    function initFormTracking() {
        const forms = document.querySelectorAll('form');
        forms.forEach((form, formIndex) => {
            const formName = getFormIdentifier(form, formIndex);

            form.addEventListener('focusin', function(e) {
                const field = e.target.closest('input, textarea, select');
                if (!field) {
                    return;
                }

                if (!state.formsStarted.has(form)) {
                    state.formsStarted.add(form);
                    trackEvent('form_start', {
                        form_name: formName,
                        section_id: getSectionIdForElement(form) || 'none'
                    });
                }

                if (!state.fieldsFocused.has(field)) {
                    state.fieldsFocused.add(field);
                    trackEvent('form_field_focus', {
                        form_name: formName,
                        field_name: getFieldName(field),
                        field_type: getFieldType(field)
                    });
                }
            });

            form.addEventListener('submit', function() {
                const fieldCount = form.querySelectorAll('input, textarea, select').length;
                trackEvent('form_submit', {
                    form_name: formName,
                    field_count: fieldCount,
                    section_id: getSectionIdForElement(form) || 'none'
                });
            });
        });
    }

    function initMediaTracking() {
        const mediaElements = document.querySelectorAll('video, audio');
        const trackedMilestonesByMedia = new WeakMap();

        mediaElements.forEach((media, index) => {
            const mediaType = media.tagName.toLowerCase();
            const mediaId = getMediaIdentifier(media, index);
            trackedMilestonesByMedia.set(media, new Set());

            media.addEventListener('play', function() {
                trackEvent('media_play', {
                    media_id: mediaId,
                    media_type: mediaType,
                    section_id: getSectionIdForElement(media) || 'none'
                });
            });

            media.addEventListener('pause', function() {
                if (media.ended) {
                    return;
                }
                trackEvent('media_pause', {
                    media_id: mediaId,
                    media_type: mediaType,
                    current_time_sec: Math.round(media.currentTime || 0)
                });
            });

            media.addEventListener('ended', function() {
                trackEvent('media_complete', {
                    media_id: mediaId,
                    media_type: mediaType,
                    duration_sec: Math.round(media.duration || 0)
                });
            });

            media.addEventListener('timeupdate', throttle(function() {
                if (!media.duration || !Number.isFinite(media.duration) || media.duration <= 0) {
                    return;
                }
                const progress = Math.round((media.currentTime / media.duration) * 100);
                const milestones = trackedMilestonesByMedia.get(media);

                [25, 50, 75, 95].forEach((milestone) => {
                    if (progress >= milestone && !milestones.has(milestone)) {
                        milestones.add(milestone);
                        trackEvent('media_progress', {
                            media_id: mediaId,
                            media_type: mediaType,
                            progress_percent: milestone
                        });
                    }
                });
            }, 1000), { passive: true });
        });
    }

    function initWebVitalsTracking() {
        if (typeof PerformanceObserver === 'undefined') {
            return;
        }

        const supportedTypes = PerformanceObserver.supportedEntryTypes || [];

        if (supportedTypes.includes('paint')) {
            const paintObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (entry.name === 'first-contentful-paint') {
                        vitals.fcp = entry.startTime;
                        trackEvent('web_vital_fcp', { value_ms: Math.round(entry.startTime) });
                    }
                });
            });
            try {
                paintObserver.observe({ type: 'paint', buffered: true });
            } catch {
                // Ignore unsupported observer options on older browsers.
            }
        }

        if (supportedTypes.includes('largest-contentful-paint')) {
            const lcpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const latest = entries[entries.length - 1];
                if (latest) {
                    vitals.lcp = latest.startTime;
                }
            });
            try {
                lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
            } catch {
                // Ignore unsupported observer options on older browsers.
            }
        }

        if (supportedTypes.includes('layout-shift')) {
            const clsObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (!entry.hadRecentInput) {
                        vitals.cls += entry.value;
                    }
                });
            });
            try {
                clsObserver.observe({ type: 'layout-shift', buffered: true });
            } catch {
                // Ignore unsupported observer options on older browsers.
            }
        }

        if (supportedTypes.includes('event')) {
            const inpObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (entry.duration > vitals.inp) {
                        vitals.inp = entry.duration;
                        vitals.inpType = entry.name || 'interaction';
                    }
                });
            });
            try {
                inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 40 });
            } catch {
                // Ignore unsupported observer options on older browsers.
            }
        }

        if (supportedTypes.includes('longtask')) {
            const longTaskObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    vitals.longTaskCount += 1;
                    vitals.maxLongTaskMs = Math.max(vitals.maxLongTaskMs, entry.duration);
                });
            });
            try {
                longTaskObserver.observe({ type: 'longtask', buffered: true });
            } catch {
                // Ignore unsupported observer options on older browsers.
            }
        }
    }

    function initErrorTracking() {
        window.addEventListener('error', function(e) {
            const resourceTarget = e.target;
            if (resourceTarget && resourceTarget !== window) {
                const resourceUrl = resourceTarget.currentSrc || resourceTarget.src || resourceTarget.href || '';
                trackEvent('resource_load_error', {
                    resource_tag: (resourceTarget.tagName || '').toLowerCase(),
                    resource_host: safeHostname(resourceUrl)
                });
                return;
            }

            trackEvent('javascript_error', {
                message: e.message || 'unknown_error',
                source: trimPathnameFromUrl(e.filename),
                line: e.lineno || 0,
                column: e.colno || 0
            });
        }, true);

        window.addEventListener('unhandledrejection', function(e) {
            trackEvent('promise_rejection', {
                reason: serializeRejectionReason(e.reason)
            });
        });
    }

    function initHoverIntentTracking() {
        if (window.matchMedia('(hover: none)').matches) {
            return;
        }

        document.querySelectorAll(
            '.project-card, .experience-card, .quest-node, .skill-tag, .contact-item, .nav-link, .btn, .project-link-btn'
        ).forEach((el) => {
            el.addEventListener('mouseenter', function() {
                if (trackedHoverElements.has(el)) {
                    return;
                }
                const timer = setTimeout(function() {
                    trackedHoverElements.add(el);
                    trackEvent('hover_intent', {
                        section_id: getSectionIdForElement(el) || 'none',
                        element_type: normalizeClassName(el.className) || el.tagName.toLowerCase()
                    });
                }, 650);
                hoverTimers.set(el, timer);
            });

            el.addEventListener('mouseleave', function() {
                const timer = hoverTimers.get(el);
                if (timer) {
                    clearTimeout(timer);
                }
            });
        });
    }

    function trackNetworkContext(eventName = 'network_context') {
        const connection = getConnectionInfo();
        trackEvent(eventName, {
            online: navigator.onLine,
            effective_type: connection.effectiveType,
            downlink_mbps: connection.downlink,
            rtt_ms: connection.rtt,
            save_data: connection.saveData
        });
    }

    document.addEventListener('pointerdown', function(e) {
        const pointerType = (e.pointerType || 'mouse').toLowerCase();
        state.activeInputMethod = pointerType;
        maybeTrackFirstInteraction(pointerType, e.target);
    }, { passive: true, capture: true });

    document.addEventListener('keydown', function(e) {
        state.activeInputMethod = 'keyboard';
        maybeTrackFirstInteraction('keyboard', e.target);
    }, { capture: true });

    document.addEventListener('click', function(e) {
        const interactiveTarget = e.target.closest('a, button, [role="button"]');
        if (!interactiveTarget) {
            return;
        }

        state.interactionCount += 1;
        trackClickDetails(interactiveTarget);
        maybeTrackRageClick(e, interactiveTarget);

        if (interactiveTarget.classList.contains('nav-link')) {
            trackEvent('navigation_click', {
                section_id: interactiveTarget.getAttribute('href') || ''
            });
        }

        if (interactiveTarget.classList.contains('project-link')) {
            const projectUrl = parseSafeUrl(interactiveTarget.getAttribute('href') || '');
            trackEvent('project_link_click', {
                project_label: getElementLabel(interactiveTarget),
                destination_domain: projectUrl.hostname || 'none',
                destination_path: projectUrl.pathname || 'none'
            });
        }

        if (interactiveTarget.classList.contains('experience-nav')) {
            trackEvent('experience_nav_click', {
                direction: interactiveTarget.classList.contains('next') ? 'next' : 'prev'
            });
        }

        if (interactiveTarget.classList.contains('experience-dot')) {
            const dotIndex = Array.from(interactiveTarget.parentElement.children).indexOf(interactiveTarget);
            trackEvent('experience_dot_click', {
                target_index: dotIndex
            });
        }

        if (interactiveTarget.hasAttribute('data-experience-jump')) {
            trackEvent('quest_jump_click', {
                quest_name: getElementLabel(interactiveTarget),
                target_index: Number(interactiveTarget.getAttribute('data-experience-jump')) || 0
            });
        }

        if (interactiveTarget.classList.contains('btn')) {
            trackEvent('cta_click', {
                cta_label: getElementLabel(interactiveTarget),
                section_id: getSectionIdForElement(interactiveTarget) || 'none'
            });
        }

        if (interactiveTarget.closest('.contact-item')) {
            trackEvent('contact_click', {
                method: getElementLabel(interactiveTarget.closest('.contact-item'))
            });
        }

        if (interactiveTarget.tagName.toLowerCase() === 'a') {
            trackLinkDetails(interactiveTarget);
        }
    }, true);

    document.addEventListener('contextmenu', function(e) {
        trackEvent('context_menu', {
            section_id: getSectionIdForElement(e.target) || 'none'
        });
    }, { passive: true });

    document.addEventListener('selectionchange', function() {
        clearTimeout(selectionDebounceTimer);
        selectionDebounceTimer = setTimeout(function() {
            const selection = window.getSelection();
            if (!selection) {
                return;
            }

            const selectedText = selection.toString().trim().replace(/\s+/g, ' ');
            if (selectedText.length < 4) {
                return;
            }

            const signature = `${selectedText.length}:${selectedText.slice(0, 24)}`;
            const now = Date.now();
            if (signature === state.lastSelectionSignature && now - state.lastSelectionTrackedAt < 2500) {
                return;
            }

            state.lastSelectionSignature = signature;
            state.lastSelectionTrackedAt = now;

            const selectedWords = selectedText.split(' ').filter(Boolean).length;
            const anchorElement = selection.anchorNode && selection.anchorNode.nodeType === Node.TEXT_NODE
                ? selection.anchorNode.parentElement
                : selection.anchorNode;

            trackEvent('text_highlight', {
                selected_chars: selectedText.length,
                selected_words: selectedWords,
                section_id: getSectionIdForElement(anchorElement) || 'none'
            });
        }, 220);
    });

    document.addEventListener('copy', function() {
        const selection = window.getSelection();
        const selectedText = (selection && selection.toString().trim()) || '';
        const anchorElement = selection && selection.anchorNode && selection.anchorNode.nodeType === Node.TEXT_NODE
            ? selection.anchorNode.parentElement
            : selection ? selection.anchorNode : null;

        trackEvent('content_copy', {
            copied_chars: selectedText.length,
            copied_words: selectedText ? selectedText.split(/\s+/).length : 0,
            section_id: getSectionIdForElement(anchorElement) || 'none'
        });
    });

    window.addEventListener('scroll', throttle(function() {
        const totalScrollable = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = totalScrollable <= 0 ? 100 : Math.round((window.scrollY / totalScrollable) * 100);
        state.maxScrollPercent = Math.max(state.maxScrollPercent, scrollPercent);

        SCROLL_MILESTONES.forEach((milestone) => {
            if (scrollPercent >= milestone && !state.firedScrollMilestones.has(milestone)) {
                state.firedScrollMilestones.add(milestone);
                trackEvent('scroll_depth', { depth_percent: milestone });
            }
        });
    }, 200), { passive: true });

    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            flushVisibleEngagement();
            trackEvent('tab_visibility_change', { state: 'hidden' });
            return;
        }

        state.visibleStartedAt = Date.now();
        trackEvent('tab_visibility_change', { state: 'visible' });
    });

    window.addEventListener('focus', function() {
        trackEvent('window_focus', {
            active_section: getCurrentSectionId()
        });
    });

    window.addEventListener('blur', function() {
        trackEvent('window_blur', {
            active_section: getCurrentSectionId()
        });
    });

    window.addEventListener('online', function() {
        trackNetworkContext('network_online');
    });

    window.addEventListener('offline', function() {
        trackEvent('network_offline', {
            online: false
        });
    });

    window.addEventListener('pageshow', function(e) {
        if (!e.persisted) {
            return;
        }
        trackEvent('page_restore', {
            restore_type: 'bfcache'
        });
    });

    const heartbeatId = window.setInterval(function() {
        if (document.visibilityState !== 'visible') {
            return;
        }

        trackEngagementMilestones();
        trackEvent('engagement_heartbeat', {
            engaged_time_sec: getEngagedSeconds(),
            max_scroll_percent: state.maxScrollPercent,
            interaction_count: state.interactionCount,
            active_section: getCurrentSectionId()
        });
    }, 30000);

    window.addEventListener('load', function() {
        const navEntry = performance.getEntriesByType('navigation')[0];
        if (!navEntry) {
            return;
        }

        vitals.ttfb = navEntry.responseStart || 0;

        trackEvent('page_performance', {
            load_time_ms: Math.round(navEntry.loadEventEnd || performance.now()),
            dom_content_loaded_ms: Math.round(navEntry.domContentLoadedEventEnd || 0),
            ttfb_ms: Math.round(vitals.ttfb),
            transfer_size_kb: Math.round((navEntry.transferSize || 0) / 1024)
        });
    });

    window.addEventListener('pagehide', function() {
        clearInterval(heartbeatId);
        flushVisibleEngagement();

        const engagedTimeSec = getEngagedSeconds();
        const totalTimeSec = getTotalSessionSeconds();
        const engagementRate = totalTimeSec > 0 ? roundNumber(engagedTimeSec / totalTimeSec, 3) : 0;

        trackEvent('page_engagement', {
            engaged_time_sec: engagedTimeSec,
            total_time_sec: totalTimeSec,
            max_scroll_percent: state.maxScrollPercent,
            interaction_count: state.interactionCount,
            sections_viewed: state.sectionViews.size,
            engagement_rate: engagementRate,
            is_bounce_like: state.interactionCount === 0 && engagedTimeSec < 10,
            transport_type: 'beacon'
        });

        trackEvent('session_quality', {
            quality_score: computeSessionQualityScore(engagedTimeSec, state.maxScrollPercent, state.interactionCount),
            engagement_bucket: getEngagementBucket(engagedTimeSec),
            scroll_bucket: getScrollBucket(state.maxScrollPercent),
            viewed_sections: state.sectionViews.size
        });

        reportWebVitalsSummary();
    }, { once: true });

    window.addEventListener('beforeunload', reportWebVitalsSummary, { once: true });

    initSectionViewTracking();
    initWebVitalsTracking();
    initErrorTracking();
    initHoverIntentTracking();
    initFormTracking();
    initMediaTracking();

    const utm = getUtmParams();
    const referrerDomain = getReferrerDomain(document.referrer);

    trackEvent('portfolio_session_start', {
        referrer_domain: referrerDomain || 'direct',
        referrer_type: referrerDomain ? 'external' : 'direct',
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        landing_page: window.location.pathname,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        utm_term: utm.utm_term,
        utm_content: utm.utm_content
    });

    trackEvent('page_context', {
        page_type: getPageType(),
        language: document.documentElement.lang || navigator.language || 'unknown',
        color_scheme: window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        reduced_motion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        touch_enabled: navigator.maxTouchPoints > 0
    });

    trackEvent('device_context', {
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        viewport_resolution: `${window.innerWidth}x${window.innerHeight}`,
        pixel_ratio: roundNumber(window.devicePixelRatio || 1, 2),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
    });

    trackNetworkContext();
}

function trackEvent(eventName, paramsOrCategory = {}, extraParams = {}) {
    if (!eventName) {
        return;
    }

    const params = typeof paramsOrCategory === 'string'
        ? { event_category: paramsOrCategory, ...extraParams }
        : paramsOrCategory;

    const payload = sanitizeAnalyticsParams({
        session_id: analyticsSessionId,
        page_path: window.location.pathname,
        page_title: document.title,
        ...params
    });

    if (typeof gtag === 'function') {
        gtag('event', eventName, payload);
        return;
    }

    if (Array.isArray(window.dataLayer)) {
        window.dataLayer.push({
            event: eventName,
            ...payload
        });
    }
}

function sanitizeAnalyticsParams(params) {
    const sanitized = {};
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) {
            return;
        }

        if (typeof value === 'string') {
            sanitized[key] = value.slice(0, 180);
            return;
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            sanitized[key] = roundNumber(value, 3);
            return;
        }

        if (typeof value === 'boolean') {
            sanitized[key] = value;
        }
    });
    return sanitized;
}

function roundNumber(value, precision) {
    const multiplier = 10 ** precision;
    return Math.round(value * multiplier) / multiplier;
}

function normalizeClassName(className) {
    if (!className || typeof className !== 'string') {
        return '';
    }
    return className.trim().split(/\s+/).slice(0, 3).join('_');
}

function getElementLabel(element) {
    if (!element) {
        return '';
    }

    const aria = element.getAttribute && element.getAttribute('aria-label');
    if (aria) {
        return aria;
    }

    const text = (element.textContent || '').trim().replace(/\s+/g, ' ');
    return text.slice(0, 80);
}

function getSectionIdForElement(element) {
    if (!element || typeof element.closest !== 'function') {
        return '';
    }
    const section = element.closest('section[id]');
    return section ? section.id : '';
}

function getCurrentSectionId() {
    const sections = Array.from(document.querySelectorAll('section[id]'));
    const marker = window.scrollY + window.innerHeight * 0.45;
    const active = sections.find((section) => {
        const top = section.offsetTop;
        const bottom = top + section.offsetHeight;
        return marker >= top && marker <= bottom;
    });
    return active ? active.id : 'none';
}

function createSessionId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeHostname(url) {
    if (!url) {
        return 'unknown';
    }

    try {
        return new URL(url, window.location.href).hostname;
    } catch {
        return 'unknown';
    }
}

function trimPathnameFromUrl(url) {
    if (!url) {
        return '';
    }

    try {
        const parsed = new URL(url, window.location.href);
        return `${parsed.hostname}${parsed.pathname}`;
    } catch {
        return String(url).slice(0, 120);
    }
}

function serializeRejectionReason(reason) {
    if (!reason) {
        return 'unknown';
    }

    if (typeof reason === 'string') {
        return reason.slice(0, 180);
    }

    if (reason instanceof Error) {
        return (reason.message || 'error').slice(0, 180);
    }

    try {
        return JSON.stringify(reason).slice(0, 180);
    } catch {
        return String(reason).slice(0, 180);
    }
}

function getPageType() {
    const path = window.location.pathname;
    if (path.endsWith('index.html') || path === '/' || path === '') {
        return 'home';
    }
    if (path.includes('portfolio-details')) {
        return 'project_detail';
    }
    return 'other';
}

function getSocialMethod(hostname) {
    if (!hostname) {
        return '';
    }
    const normalized = hostname.toLowerCase();
    if (normalized.includes('linkedin.com')) {
        return 'linkedin';
    }
    if (normalized.includes('github.com')) {
        return 'github';
    }
    if (normalized.includes('twitter.com') || normalized.includes('x.com')) {
        return 'twitter';
    }
    if (normalized.includes('tastematesapp.com')) {
        return 'tastemates';
    }
    return '';
}

function parseSafeUrl(url) {
    if (!url) {
        return { hostname: '', pathname: '' };
    }
    try {
        const parsed = new URL(url, window.location.href);
        return {
            hostname: parsed.hostname.replace(/^www\./, ''),
            pathname: parsed.pathname || '/'
        };
    } catch {
        return { hostname: '', pathname: '' };
    }
}

function getUtmParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        utm_source: params.get('utm_source') || '',
        utm_medium: params.get('utm_medium') || '',
        utm_campaign: params.get('utm_campaign') || '',
        utm_term: params.get('utm_term') || '',
        utm_content: params.get('utm_content') || ''
    };
}

function getReferrerDomain(referrer) {
    if (!referrer) {
        return '';
    }
    try {
        return new URL(referrer).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

function getConnectionInfo() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
        effectiveType: connection && connection.effectiveType ? connection.effectiveType : 'unknown',
        downlink: connection && typeof connection.downlink === 'number' ? roundNumber(connection.downlink, 2) : 0,
        rtt: connection && typeof connection.rtt === 'number' ? connection.rtt : 0,
        saveData: Boolean(connection && connection.saveData)
    };
}

function detectInitialInputMethod() {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
        return 'touch';
    }
    return 'mouse';
}

function getFormIdentifier(form, formIndex) {
    return form.getAttribute('name')
        || form.getAttribute('id')
        || form.getAttribute('aria-label')
        || `form_${formIndex + 1}`;
}

function getFieldName(field) {
    return field.getAttribute('name')
        || field.getAttribute('id')
        || field.getAttribute('aria-label')
        || field.getAttribute('placeholder')
        || field.tagName.toLowerCase();
}

function getFieldType(field) {
    if (field.tagName.toLowerCase() === 'textarea') {
        return 'textarea';
    }
    if (field.tagName.toLowerCase() === 'select') {
        return 'select';
    }
    return field.getAttribute('type') || 'text';
}

function getMediaIdentifier(media, index) {
    return media.getAttribute('id')
        || media.getAttribute('data-analytics-id')
        || trimPathnameFromUrl(media.currentSrc || media.src || '')
        || `media_${index + 1}`;
}

function computeSessionQualityScore(engagedSeconds, maxScrollPercent, interactionCount) {
    const engagementScore = Math.min(engagedSeconds / 120, 1) * 50;
    const scrollScore = Math.min(maxScrollPercent / 100, 1) * 30;
    const interactionScore = Math.min(interactionCount / 12, 1) * 20;
    return Math.round(engagementScore + scrollScore + interactionScore);
}

function getEngagementBucket(engagedSeconds) {
    if (engagedSeconds >= 120) {
        return 'high';
    }
    if (engagedSeconds >= 45) {
        return 'medium';
    }
    return 'low';
}

function getScrollBucket(maxScrollPercent) {
    if (maxScrollPercent >= 90) {
        return 'deep';
    }
    if (maxScrollPercent >= 50) {
        return 'mid';
    }
    return 'shallow';
}

function throttle(func, limit) {
    let inThrottle;
    return function throttledFunction(...args) {
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
            }, limit);
        }
    };
}
