import { initAnalytics } from './analytics.js';

// ===== MAIN JAVASCRIPT =====

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all components
    initMobileNavigation();
    initSmoothScrolling();
    initActiveNavigation();
    initAnimations();
    initExperienceCarousel();
    initAnalytics();
});

// ===== MOBILE NAVIGATION =====
function initMobileNavigation() {
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    if (navToggle && navMenu) {
        // Toggle mobile menu
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
            navToggle.setAttribute('aria-expanded', String(navMenu.classList.contains('active')));
        });

        // Close mobile menu when clicking on links
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
            });
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }
}

// ===== SMOOTH SCROLLING =====
function initSmoothScrolling() {
    // Smooth scroll for navigation links
    const navLinks = document.querySelectorAll('a[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            
            // Skip if it's just '#'
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                e.preventDefault();
                
                const offsetTop = targetElement.offsetTop - 80; // Account for fixed nav
                
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// ===== ACTIVE NAVIGATION HIGHLIGHTING =====
function initActiveNavigation() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    function updateActiveNav() {
        const scrollPosition = window.scrollY + 100;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            const sectionId = section.getAttribute('id');

            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                // Remove active class from all nav links
                navLinks.forEach(link => link.classList.remove('active'));
                
                // Add active class to current nav link
                const activeLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
                if (activeLink) {
                    activeLink.classList.add('active');
                }
            }
        });
    }

    // Update active nav on scroll
    window.addEventListener('scroll', throttle(updateActiveNav, 100));
    
    // Initial call
    updateActiveNav();
}

// ===== SCROLL ANIMATIONS =====
function initAnimations() {
    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe elements that should animate in
    const animateElements = document.querySelectorAll(`
        .info-card,
        .skill-category,
        .experience-card,
        .project-card,
        .contact-item
    `);

    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(el);
    });

    // Add CSS for animate-in class
    const style = document.createElement('style');
    style.textContent = `
        .animate-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);
}

// ===== NAVBAR BACKGROUND ON SCROLL =====
function initNavbarScroll() {
    const navbar = document.querySelector('.nav');
    
    function updateNavbar() {
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(255, 255, 255, 0.98)';
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
        } else {
            navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = 'none';
        }
    }
    
    window.addEventListener('scroll', throttle(updateNavbar, 100));
}

// ===== PROJECT CARD INTERACTIONS =====
function initProjectCards() {
    const projectCards = document.querySelectorAll('.project-card');
    
    projectCards.forEach(card => {
        const overlay = card.querySelector('.project-overlay');
        const image = card.querySelector('.project-image img');
        
        if (overlay && image) {
            card.addEventListener('mouseenter', function() {
                overlay.style.opacity = '1';
                image.style.transform = 'scale(1.05)';
            });
            
            card.addEventListener('mouseleave', function() {
                overlay.style.opacity = '0';
                image.style.transform = 'scale(1)';
            });
        }
    });
}

// ===== CONTACT FORM HANDLING =====
function initContactForm() {
    const contactItems = document.querySelectorAll('.contact-item');
    
    contactItems.forEach(item => {
        item.addEventListener('click', function() {
            const link = this.querySelector('a');
            if (link) {
                link.click();
            }
        });
        
        // Add cursor pointer style
        item.style.cursor = 'pointer';
    });
}

// ===== SKILL TAG INTERACTIONS =====
function initSkillTags() {
    const skillTags = document.querySelectorAll('.skill-tag');
    
    skillTags.forEach(tag => {
        tag.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
        });
        
        tag.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        });
    });
}

// ===== EXPERIENCE CAROUSEL =====
function initExperienceCarousel() {
    const carousels = document.querySelectorAll('[data-experience-carousel]');

    carousels.forEach(carousel => {
        const track = carousel.querySelector('.experience-track');
        const questTrack = carousel.querySelector('.quest-track');
        const cards = Array.from(carousel.querySelectorAll('.experience-card'));
        const prevButton = carousel.querySelector('.experience-nav.prev');
        const nextButton = carousel.querySelector('.experience-nav.next');
        const dotsContainer = carousel.querySelector('.experience-dots');
        const questNodes = Array.from(carousel.querySelectorAll('[data-experience-jump]'));

        if (!track || cards.length === 0 || !dotsContainer) {
            return;
        }

        let activeIndex = 0;
        let scrollTimer;

        cards.forEach((_, index) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'experience-dot';
            dot.setAttribute('aria-label', `Go to experience ${index + 1}`);
            dot.addEventListener('click', function() {
                goToCard(index);
            });
            dotsContainer.appendChild(dot);
        });

        const dots = Array.from(dotsContainer.querySelectorAll('.experience-dot'));

        function syncQuestNodeIntoView(behavior = 'smooth') {
            if (!questTrack || questNodes.length === 0) {
                return;
            }

            const activeNode = questNodes.find(node => Number(node.dataset.experienceJump) === activeIndex);
            if (!activeNode) {
                return;
            }

            const targetLeft = activeNode.offsetLeft - ((questTrack.clientWidth - activeNode.offsetWidth) / 2);
            const maxLeft = Math.max(0, questTrack.scrollWidth - questTrack.clientWidth);
            const clampedLeft = Math.max(0, Math.min(targetLeft, maxLeft));
            const distance = Math.abs(questTrack.scrollLeft - clampedLeft);

            if (distance > 2) {
                questTrack.scrollTo({
                    left: clampedLeft,
                    behavior
                });
            }
        }

        function updateUiState(questBehavior = 'smooth') {
            if (prevButton) {
                prevButton.disabled = activeIndex === 0;
            }

            if (nextButton) {
                nextButton.disabled = activeIndex === cards.length - 1;
            }

            dots.forEach((dot, index) => {
                dot.classList.toggle('active', index === activeIndex);
            });

            questNodes.forEach(node => {
                const nodeIndex = Number(node.dataset.experienceJump);
                const isFocused = nodeIndex === activeIndex;
                node.classList.toggle('is-focused', isFocused);
                if (isFocused) {
                    node.setAttribute('aria-current', 'true');
                } else {
                    node.removeAttribute('aria-current');
                }
            });

            syncQuestNodeIntoView(questBehavior);
        }

        function goToCard(index, behavior = 'smooth') {
            activeIndex = Math.max(0, Math.min(index, cards.length - 1));
            track.scrollTo({
                left: cards[activeIndex].offsetLeft,
                behavior
            });
            updateUiState(behavior);
        }

        function syncFromScrollPosition() {
            const currentLeft = track.scrollLeft;
            let closestIndex = 0;
            let smallestDistance = Number.POSITIVE_INFINITY;

            cards.forEach((card, index) => {
                const distance = Math.abs(card.offsetLeft - currentLeft);
                if (distance < smallestDistance) {
                    smallestDistance = distance;
                    closestIndex = index;
                }
            });

            if (closestIndex !== activeIndex) {
                activeIndex = closestIndex;
                updateUiState('auto');
            }
        }

        if (prevButton) {
            prevButton.addEventListener('click', function() {
                goToCard(activeIndex - 1);
            });
        }

        if (nextButton) {
            nextButton.addEventListener('click', function() {
                goToCard(activeIndex + 1);
            });
        }

        track.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                goToCard(activeIndex + 1);
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goToCard(activeIndex - 1);
            }
        });

        track.addEventListener('scroll', function() {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(syncFromScrollPosition, 80);
        }, { passive: true });

        questNodes.forEach(node => {
            node.addEventListener('click', function() {
                const targetIndex = Number(node.dataset.experienceJump);
                if (!Number.isNaN(targetIndex)) {
                    goToCard(targetIndex);
                }
            });
        });

        window.addEventListener('resize', debounce(function() {
            goToCard(activeIndex, 'auto');
        }, 120));

        updateUiState();
    });
}

// ===== UTILITY FUNCTIONS =====

// Throttle function to limit function calls
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Debounce function for better performance
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ===== ADDITIONAL FEATURES =====

// Initialize all additional features when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initNavbarScroll();
    initProjectCards();
    initContactForm();
    initSkillTags();
});

// ===== KEYBOARD NAVIGATION =====
document.addEventListener('keydown', function(e) {
    // ESC key closes mobile menu
    if (e.key === 'Escape') {
        const navMenu = document.getElementById('nav-menu');
        const navToggle = document.getElementById('nav-toggle');
        
        if (navMenu && navToggle && navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
            navToggle.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
        }
    }
});

// ===== SCROLL TO TOP FUNCTIONALITY =====
function initScrollToTop() {
    // Create scroll to top button
    const scrollBtn = document.createElement('button');
    scrollBtn.innerHTML = '↑';
    scrollBtn.className = 'scroll-to-top';
    scrollBtn.setAttribute('aria-label', 'Scroll to top');
    
    // Style the button
    Object.assign(scrollBtn.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        backgroundColor: 'var(--primary-color)',
        color: 'white',
        border: 'none',
        fontSize: '20px',
        cursor: 'pointer',
        opacity: '0',
        visibility: 'hidden',
        transition: 'all 0.3s ease',
        zIndex: '1000'
    });
    
    document.body.appendChild(scrollBtn);
    
    // Show/hide button based on scroll position
    function toggleScrollBtn() {
        if (window.scrollY > 300) {
            scrollBtn.style.opacity = '1';
            scrollBtn.style.visibility = 'visible';
        } else {
            scrollBtn.style.opacity = '0';
            scrollBtn.style.visibility = 'hidden';
        }
    }
    
    // Scroll to top when clicked
    scrollBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    window.addEventListener('scroll', throttle(toggleScrollBtn, 100));
}

// Initialize scroll to top
document.addEventListener('DOMContentLoaded', initScrollToTop);

// ===== PERFORMANCE OPTIMIZATIONS =====

// Lazy load images when they come into view
function initLazyLoading() {
    const images = document.querySelectorAll('img[data-src]');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                observer.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
}

// Preload critical resources
function preloadResources() {
    const criticalImages = [
        'assets/img/portfolio/portfolio-1.png',
        'assets/img/portfolio/portfolio-4.png'
    ];
    
    criticalImages.forEach(src => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = src;
        document.head.appendChild(link);
    });
}

// Initialize performance optimizations
document.addEventListener('DOMContentLoaded', function() {
    initLazyLoading();
    preloadResources();
});

// ===== ERROR HANDLING =====
window.addEventListener('error', function(e) {
    console.error('An error occurred:', e.error);
    // You could send this to an error tracking service
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
});

console.log('🚀 Wayne Zheng Portfolio - Loaded and Ready!'); 
