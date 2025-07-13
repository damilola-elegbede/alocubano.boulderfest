// Design 4 - Typographic JavaScript Effects

document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.main-nav');

    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            navMenu.classList.toggle('is-open');
            menuToggle.classList.toggle('is-active');
        });
    }

    // Typewriter effect
    const typewriterElements = document.querySelectorAll('.typewriter');

    typewriterElements.forEach(element => {
        const text = element.textContent;
        element.textContent = '';
        element.style.visibility = 'visible';

        let index = 0;
        const typeWriter = setInterval(() => {
            if (index < text.length) {
                element.textContent += text.charAt(index);
                index++;
            } else {
                clearInterval(typeWriter);
            }
        }, 50);
    });

    // Split text for letter animations
    const animatedTextElements = document.querySelectorAll('.hero-title-massive');

    animatedTextElements.forEach(element => {
        const words = element.querySelectorAll('.word');
        words.forEach((word, wordIndex) => {
            const text = word.textContent;
            word.innerHTML = text.split('').map((letter, index) =>
                `<span class="letter" style="animation-delay: ${wordIndex * 0.1 + index * 0.02}s">${letter}</span>`
            ).join('');
        });
    });

    // Parallax effect for vertical text
    const verticalTexts = document.querySelectorAll('.text-block-vertical');

    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        verticalTexts.forEach(text => {
            const speed = text.dataset.speed || 0.5;
            text.style.transform = `translateY(${scrolled * speed}px)`;
        });
    });

    // Hover effects for gallery items
    const galleryItems = document.querySelectorAll('.gallery-item-type');

    galleryItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.querySelector('.text-glitch').classList.add('active');
        });

        item.addEventListener('mouseleave', function() {
            this.querySelector('.text-glitch').classList.remove('active');
        });
    });

    // Text reveal on scroll
    const revealElements = document.querySelectorAll('.text-block-large, .text-block-serif');

    const revealOnScroll = () => {
        revealElements.forEach(element => {
            const elementTop = element.getBoundingClientRect().top;
            const elementVisible = 150;

            if (elementTop < window.innerHeight - elementVisible) {
                element.classList.add('revealed');
            }
        });
    };

    window.addEventListener('scroll', revealOnScroll);
    revealOnScroll(); // Check on load

    // Random text effects for glitch elements
    const glitchElements = document.querySelectorAll('.text-glitch');

    glitchElements.forEach(element => {
        setInterval(() => {
            element.style.animation = 'none';
            setTimeout(() => {
                element.style.animation = '';
            }, 10);
        }, 3000 + Math.random() * 2000);
    });

    // Circular text animation
    const circularTexts = document.querySelectorAll('.circular-text');

    circularTexts.forEach(text => {
        const textPath = text.querySelector('textPath');
        if (textPath) {
            const textContent = textPath.textContent;
            textPath.textContent = textContent + ' • ' + textContent + ' • ';
        }
    });

    // Navigation link hover effect
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.addEventListener('mouseenter', function() {
            const text = this.textContent;
            this.dataset.text = text;
        });
    });

    // Form input animations
    const formInputs = document.querySelectorAll('.form-input-type, .form-textarea-type');

    formInputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.classList.add('focused');
        });

        input.addEventListener('blur', function() {
            if (!this.value) {
                this.parentElement.classList.remove('focused');
            }
        });
    });

    // Number counter animation
    const counters = document.querySelectorAll('[data-count]');

    counters.forEach(counter => {
        const target = parseInt(counter.dataset.count);
        const duration = 2000;
        const increment = target / (duration / 16);
        let current = 0;

        const updateCounter = () => {
            current += increment;
            if (current < target) {
                counter.textContent = Math.floor(current);
                requestAnimationFrame(updateCounter);
            } else {
                counter.textContent = target;
            }
        };

        // Start animation when element is visible
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    updateCounter();
                    observer.unobserve(entry.target);
                }
            });
        });

        observer.observe(counter);
    });
});

// Add CSS classes dynamically for text animations
document.addEventListener('DOMContentLoaded', function() {
    // Add stagger animation to lists
    const lists = document.querySelectorAll('.text-composition ul');
    lists.forEach(list => {
        const items = list.querySelectorAll('li');
        items.forEach((item, index) => {
            item.style.animationDelay = `${index * 0.1}s`;
            item.classList.add('fade-in-up');
        });
    });
});