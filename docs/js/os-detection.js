document.addEventListener('DOMContentLoaded', () => {
  // Detect user's operating system
  function detectOS() {
    const userAgent = window.navigator.userAgent
    let os = 'unknown'

    if (userAgent.includes('Windows'))
      os = 'windows'
    else if (userAgent.includes('Mac'))
      os = 'mac'
    else if (userAgent.includes('Linux'))
      os = 'linux'

    return os
  }

  // Get all download button sets
  const downloadSets = document.querySelectorAll('.download-options')

  // Highlight appropriate button in each set based on OS
  downloadSets.forEach((set) => {
    const os = detectOS()
    const buttons = set.querySelectorAll('.os-button')

    buttons.forEach((button) => {
      if (os === 'windows' && button.classList.contains('windows-button')) {
        button.classList.add('active')
      }
      else if (os === 'mac' && button.classList.contains('mac-button')) {
        button.classList.add('active')
      }
      else if (os === 'linux' && button.classList.contains('linux-button')) {
        button.classList.add('active')
      }
    })
  })

  // Add hover animation effects
  const osButtons = document.querySelectorAll('.os-button')

  osButtons.forEach((button) => {
    button.addEventListener('mouseenter', function () {
      this.style.transform = 'translateY(-3px)'
    })

    button.addEventListener('mouseleave', function () {
      if (!this.classList.contains('active')) {
        this.style.transform = ''
      }
    })
  })

  // Add scroll animations
  const animatedElements = document.querySelectorAll('.feature-box, .step')

  function checkScroll() {
    animatedElements.forEach((el, index) => {
      const elementPosition = el.getBoundingClientRect().top
      const screenPosition = window.innerHeight / 1.2

      if (elementPosition < screenPosition) {
        setTimeout(() => {
          el.style.opacity = '1'
          el.style.transform = 'translateY(0)'
        }, index * 100) // Stagger the animations
      }
    })
  }

  // Set initial state for animated elements
  animatedElements.forEach((el) => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(30px)'
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease'
  })

  // Check scroll position on page load and scroll
  window.addEventListener('scroll', checkScroll)
  checkScroll()
})
