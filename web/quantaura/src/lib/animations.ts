import type { Variants, Transition } from 'motion/react';

// ═══════════════════════════════════════════
// CUSTOM EASING CURVES
// ═══════════════════════════════════════════

export const easeOutExpo = [0.16, 1, 0.3, 1] as const;
export const easeOutQuart = [0.25, 1, 0.5, 1] as const;
export const easeOutBack = [0.34, 1.56, 0.64, 1] as const;
export const easeInOutCubic = [0.65, 0, 0.35, 1] as const;

export const smoothSpring: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

export const heavySpring: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 25,
  mass: 1.2,
};

// ═══════════════════════════════════════════
// HERO SECTION
// ═══════════════════════════════════════════

export const heroWordContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.2,
    },
  },
};

export const heroWord: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    rotateX: 8,
    filter: 'blur(4px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.6,
      ease: easeOutExpo as any,
    },
  },
};

export const heroBadge: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.9 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: easeOutExpo as any,
    },
  },
};

export const heroBlurIn: Variants = {
  hidden: {
    opacity: 0,
    y: 16,
    filter: 'blur(10px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.8,
      delay: 0.5,
      ease: easeOutQuart as any,
    },
  },
};

export const heroButton: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.92 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
      delay: 0.6 + i * 0.1,
    },
  }),
};

export const heroStatItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      delay: 0.9 + i * 0.15,
      ease: easeOutQuart as any,
    },
  }),
};

// ═══════════════════════════════════════════
// BENTO GRID
// ═══════════════════════════════════════════

export const bentoContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

export const bentoCard: Variants = {
  hidden: {
    opacity: 0,
    y: 40,
    scale: 0.97,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: easeOutExpo as any,
    },
  },
};

export const bentoCardContent: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: 0.3,
      ease: easeOutQuart as any,
    },
  },
};

export const sectionHeading: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: easeOutExpo as any,
    },
  },
};

export const sectionSubheading: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: 0.12,
      ease: easeOutQuart as any,
    },
  },
};

// ═══════════════════════════════════════════
// HOW IT WORKS STEPPER
// ═══════════════════════════════════════════

export const stepContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.3,
    },
  },
};

export const stepCard: Variants = {
  hidden: {
    opacity: 0,
    y: 40,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: easeOutExpo as any,
    },
  },
};

export const stepConnector: Variants = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: {
      duration: 2,
      ease: easeInOutCubic as any,
    },
  },
};

// ═══════════════════════════════════════════
// MODEL STATS
// ═══════════════════════════════════════════

export const modelStatCard: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: i * 0.1,
      ease: easeOutExpo as any,
    },
  }),
};

export const modelCard: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      delay: 0.2 + i * 0.12,
      ease: easeOutExpo as any,
    },
  }),
};

export const modelBorderDraw: Variants = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: {
      duration: 0.8,
      delay: 0.4,
      ease: easeOutQuart as any,
    },
  },
};

// ═══════════════════════════════════════════
// TECH STACK
// ═══════════════════════════════════════════

export const techContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const techItem: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: easeOutQuart as any,
    },
  },
};

// ═══════════════════════════════════════════
// GLOBAL INTERACTION PATTERNS
// ═══════════════════════════════════════════

export const cardHover = {
  y: -4,
  transition: { type: 'spring' as const, stiffness: 300, damping: 20 },
};

export const buttonTap = { scale: 0.97 };

export const pageEntrance: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
};

// ═══════════════════════════════════════════
// SIGNAL PREVIEW
// ═══════════════════════════════════════════

export const signalBadgeGlow = (color: string) => ({
  boxShadow: [
    `0 0 0px ${color}`,
    `0 0 12px ${color}`,
    `0 0 0px ${color}`,
  ],
  transition: {
    duration: 2,
    repeat: Infinity,
    ease: 'easeInOut' as const,
  },
});
