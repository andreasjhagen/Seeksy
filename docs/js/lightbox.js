document.addEventListener('DOMContentLoaded', () => {
  // Create lightbox elements
  const lightbox = document.createElement('div')
  lightbox.className = 'lightbox'

  const lightboxContent = document.createElement('img')
  lightboxContent.className = 'lightbox-content'

  const lightboxClose = document.createElement('span')
  lightboxClose.className = 'lightbox-close'
  lightboxClose.innerHTML = '&times;'

  const lightboxCaption = document.createElement('div')
  lightboxCaption.className = 'lightbox-caption'

  lightbox.appendChild(lightboxContent)
  lightbox.appendChild(lightboxClose)
  lightbox.appendChild(lightboxCaption)
  document.body.appendChild(lightbox)

  // Get all screenshots
  const screenshots = document.querySelectorAll('.screenshot-img')

  // Add click event to each screenshot
  screenshots.forEach((screenshot) => {
    screenshot.addEventListener('click', function () {
      lightbox.classList.add('active')
      lightboxContent.src = this.src
      lightboxCaption.textContent = this.alt

      // Add subtle entrance animation
      lightboxContent.style.opacity = '0'
      lightboxContent.style.transform = 'scale(0.9)'

      setTimeout(() => {
        lightboxContent.style.opacity = '1'
        lightboxContent.style.transform = 'scale(1)'
      }, 50)

      document.body.style.overflow = 'hidden'
    })
  })

  // Close lightbox when clicking the close button
  lightboxClose.addEventListener('click', closeLightbox)

  // Close lightbox when clicking outside the image
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      closeLightbox()
    }
  })

  // Close lightbox when pressing Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.classList.contains('active')) {
      closeLightbox()
    }
  })

  function closeLightbox() {
    lightboxContent.style.opacity = '0'
    lightboxContent.style.transform = 'scale(0.9)'

    setTimeout(() => {
      lightbox.classList.remove('active')
      document.body.style.overflow = ''
    }, 300)
  }

  // Add scroll reveal animation to screenshot boxes
  const screenshotBoxes = document.querySelectorAll('.screenshot-box')

  function checkScroll() {
    screenshotBoxes.forEach((box) => {
      const boxPosition = box.getBoundingClientRect().top
      const screenPosition = window.innerHeight / 1.3

      if (boxPosition < screenPosition) {
        box.style.opacity = '1'
        box.style.transform = 'translateY(0)'
      }
    })
  }

  // Set initial state for screenshot boxes
  screenshotBoxes.forEach((box) => {
    box.style.opacity = '0'
    box.style.transform = 'translateY(30px)'
    box.style.transition = 'opacity 0.6s ease, transform 0.6s ease'
  })

  // Check scroll position on page load and scroll
  window.addEventListener('scroll', checkScroll)
  checkScroll()
})
