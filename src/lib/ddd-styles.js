// File for DDD Auditing tool

export const COLORS = [
    "--ddd-theme-default-beaverBlue",
    "--ddd-theme-default-beaver70",
    "--ddd-theme-default-beaver80",
    "--ddd-theme-default-landgrantBrown",
    "--ddd-theme-default-nittanyNavy",
    "--ddd-theme-default-navy40",
    "--ddd-theme-default-navy60",
    "--ddd-theme-default-navy65",
    "--ddd-theme-default-navy70",
    "--ddd-theme-default-navy80",
    "--ddd-theme-default-potentialMidnight",
    "--ddd-theme-default-potential0",
    "--ddd-theme-default-potential50",
    "--ddd-theme-default-potential70",
    "--ddd-theme-default-potential75",
    "--ddd-theme-default-pughBlue",
    "--ddd-theme-default-coalyGray",
    "--ddd-theme-default-keystoneYellow",
    "--ddd-theme-default-slateGray",
    "--ddd-theme-default-slateLight",
    "--ddd-theme-default-slateMaxLight",
    "--ddd-theme-default-skyBlue",
    "--ddd-theme-default-skyLight",
    "--ddd-theme-default-skyMaxLight",
    "--ddd-theme-default-limestoneGray",
    "--ddd-theme-default-limestoneLight",
    "--ddd-theme-default-limestoneMaxLight",
    "--ddd-theme-default-white",
    "--ddd-theme-default-shrineLight",
    "--ddd-theme-default-shrineMaxLight",
    "--ddd-theme-default-creekTeal",
    "--ddd-theme-default-creekLight",
    "--ddd-theme-default-creekMaxLight",
    "--ddd-theme-default-shrineTan",
    "--ddd-theme-default-roarGolden",
    "--ddd-theme-default-roarLight",
    "--ddd-theme-default-roarMaxlight",
    "--ddd-theme-default-forestGreen",
    "--ddd-theme-default-athertonViolet",
    "--ddd-theme-default-original87Pink",
    "--ddd-theme-default-discoveryCoral",
    "--ddd-theme-default-futureLime",
    "--ddd-theme-default-wonderPurple",
    "--ddd-theme-default-inventOrange",
    "--ddd-theme-default-opportunityGreen",
    "--ddd-theme-default-globalNeon",
    "--ddd-theme-default-accent",
    "--ddd-theme-default-white85",
    "--ddd-theme-default-white65",
]

export const FUNCTIONAL_COLORS = [
  "--ddd-theme-default-link",
  "--ddd-theme-default-link80",
  "--ddd-theme-default-linkLight",
  "--ddd-theme-default-disabled",
  "--ddd-theme-default-error",
  "--ddd-theme-default-errorLight",
  "--ddd-theme-default-warning",
  "--ddd-theme-default-warningLight",
  "--ddd-theme-default-info",
  "--ddd-theme-default-infoLight",
  "--ddd-theme-default-success",
  "--ddd-theme-default-successLight",
  "--ddd-theme-default-alertImmediate",
  "--ddd-theme-default-alertUrgent",
  "--ddd-theme-default-alertAllClear",
  "--ddd-theme-default-alertNonEmergency",
  "--ddd-theme-default-background",
  "--ddd-theme-default-disabled",
]

export const FONT_FAMILIES = [
  "--ddd-font-primary", // "Roboto", "Franklin Gothic Medium", Tahoma, sans-serif
  "--ddd-font-secondary", // "Roboto Slab", serif
  "--ddd-font-navigation", // "Roboto Condensed", sans-serif
]

export const FONT_WEIGHTS = [
  "--ddd-font-weight-light", // 300
  "--ddd-font-weight-regular", // 400 (default weight for body)
  "--ddd-font-weight-medium", // 500
  "--ddd-font-weight-bold",  // 700
  "--ddd-font-weight-black", // 900
]

export const FONT_SIZES = [
  "--ddd-font-size-4xs", // 16px
  "--ddd-font-size-3xs", // 18px
  "--ddd-font-size-xxs", // 20px
  "--ddd-font-size-xs", // 22px
  "--ddd-font-size-s", // 24px
  "--ddd-font-size-ms", // 28px
  "--ddd-font-size-m", // 32px
  "--ddd-font-size-ml", // 36px
  "--ddd-font-size-l", // 40px
  "--ddd-font-size-xl", // 48px
  "--ddd-font-size-xxl", // 56px
  "--ddd-font-size-3xl", // 64px
  "--ddd-font-size-4xl", // 72px
  
  "--ddd-font-size-type1-s", // 80px
  "--ddd-font-size-type1-m", // 150px
  "--ddd-font-size-type1-l", // 200px
]

export const LETTER_SPACING = [
  "--ddd-ls-16-sm", // 0.08px
  "--ddd-ls-18-sm", // 0.09px
  "--ddd-ls-20-sm", // 0.1px
  "--ddd-ls-22-sm", // 0.11px
  "--ddd-ls-24-sm", // 0.12px
  "--ddd-ls-28-sm", // 0.14px
  "--ddd-ls-32-sm", // 0.16px
  "--ddd-ls-36-sm", // 0.18px
  "--ddd-ls-40-sm", // 0.2px
  "--ddd-ls-48-sm", // 0.24px
  "--ddd-ls-56-sm", // 0.28px
  "--ddd-ls-64-sm", // 0.32px
  "--ddd-ls-72-sm", // 0.36px
  "--ddd-ls-16-lg", // 0.24px
  "--ddd-ls-18-lg", // 0.27px
  "--ddd-ls-20-lg", // 0.3px
  "--ddd-ls-22-lg", // 0.33px
  "--ddd-ls-24-lg", // 0.36px
  "--ddd-ls-28-lg", // 0.42px
  "--ddd-ls-32-lg", // 0.48px
  "--ddd-ls-36-lg", // 0.54px
  "--ddd-ls-40-lg", // 0.6px
  "--ddd-ls-48-lg", // 0.72px
  "--ddd-ls-56-lg", // 0.84px
  "--ddd-ls-64-lg", // 0.96px
  "--ddd-ls-72-lg", // 1.08px
]

export const LINE_HEIGHTS = [
  "--ddd-lh-120", // 120%
  "--ddd-lh-140", // 140%
  "--ddd-lh-150", // 150%
]

export const SPACING = [
  "--ddd-spacing-0", // 0px
  "--ddd-spacing-1", // 4px (body default)
  "--ddd-spacing-2", // 8px
  "--ddd-spacing-3", // 12px (h6)
  "--ddd-spacing-4", // 16px (h5)
  "--ddd-spacing-5", // 20px (h4)
  "--ddd-spacing-6", // 24px (h3)
  "--ddd-spacing-7", // 28px (h2)
  "--ddd-spacing-8", // 32px (h1)
  "--ddd-spacing-9", // 36px
  "--ddd-spacing-10", // 40px
  "--ddd-spacing-11", // 44px
  "--ddd-spacing-12", // 48px
  "--ddd-spacing-13", // 52px
  "--ddd-spacing-14", // 56px
  "--ddd-spacing-15", // 60px
  "--ddd-spacing-16", // 64px
  "--ddd-spacing-17", // 68px
  "--ddd-spacing-18", // 72px
  "--ddd-spacing-19", // 76px
  "--ddd-spacing-20", // 80px
  "--ddd-spacing-21", // 84px
  "--ddd-spacing-22", // 88px
  "--ddd-spacing-23", // 92px
  "--ddd-spacing-24", // 96px
  "--ddd-spacing-25", // 100px
  "--ddd-spacing-26", // 104px
  "--ddd-spacing-27", // 108px
  "--ddd-spacing-28", // 112px
  "--ddd-spacing-29", // 116px
  "--ddd-spacing-30", // 120px
]

export const BORDER_PRESETS = [
  "--ddd-border-xs", // 1px solid greyish
  "--ddd-border-sm", // 2px solid greyish
  "--ddd-border-md", // 3px solid greyish
  "--ddd-border-lg", // 4px solid greyish
]

export const BORDER_SIZES = [
  "--ddd-border-size-xs", // 1px
  "--ddd-border-size-sm", // 2px
  "--ddd-border-size-md", // 3px
  "--ddd-border-size-lg", // 4px
]

export const BORDER_HEADER_THICKNESSES = [
  "--ddd-theme-header-border-thickness-0", // 0px
  "--ddd-theme-header-border-thickness-xs", // 1px
  "--ddd-theme-header-border-thickness-sm", // 2px
  "--ddd-theme-header-border-thickness-md", // 3px
  "--ddd-theme-header-border-thickness-lg", // 4px
]

export const BORDER_HEADER_TREATMENTS = [
  "--ddd-theme-header-border-treatment-0", // 0px
  "--ddd-theme-header-border-treatment-10p", // 10% good
  "--ddd-theme-header-border-treatment-25p", // 25% good
  "--ddd-theme-header-border-treatment-50p", // 50% good
  "--ddd-theme-header-border-treatment-75p", // 75%
  "--ddd-theme-header-border-treatment-full", // 100% good
  "--ddd-theme-header-border-treatment-sm", // 28px
  "--ddd-theme-header-border-treatment-md", // 56px
  "--ddd-theme-header-border-treatment-lg", // 84px
]

export const SHADOWS = [
  "--ddd-boxShadow-0", // 0px
  "--ddd-boxShadow-sm", // 4px
  "--ddd-boxShadow-md", // 8px
  "--ddd-boxShadow-lg", // 12px
  "--ddd-boxShadow-xl", // 16px
]

export const BREAKPOINTS = [
  "--ddd-breakpoint-sm", // 360px
  "--ddd-breakpoint-md", // 768px
  "--ddd-breakpoint-lg", // 1080px
  "--ddd-breakpoint-xl", // 1440px
]

export const RADIUS = [
  "--ddd-radius-0", // 0px
  "--ddd-radius-xs", // 4px
  "--ddd-radius-sm", // 8px
  "--ddd-radius-md", // 12px
  "--ddd-radius-lg", // 16px
  "--ddd-radius-xl", // 20px
  "--ddd-radius-rounded", // 100px
  "--ddd-radius-circle", // 100%
]

export const GRADIENTS = [
  "--ddd-theme-default-gradient-navBar",
  "--ddd-theme-default-gradient-footer",
  "--ddd-theme-default-gradient-newsFeature",
  "--ddd-theme-default-gradient-buttons",
  "--ddd-theme-default-gradient-hero",
  "--ddd-theme-default-gradient-hero2",
  "--ddd-theme-default-gradient-antihero",
  "--ddd-theme-default-gradient-antihero2",
]

export const ICON_SIZES = [
  "--ddd-icon-3xs", // 20px
  "--ddd-icon-xxs", // 24px
  "--ddd-icon-xs", // 32px
  "--ddd-icon-sm", // 40px
  "--ddd-icon-md", // 48px
  "--ddd-icon-lg", // 56px
  "--ddd-icon-xl", // 64px
  "--ddd-icon-2xl", // 72px
  "--ddd-icon-3xl", // 84px
  "--ddd-icon-4xl", // 96px
]