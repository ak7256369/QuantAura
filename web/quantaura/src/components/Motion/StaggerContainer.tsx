'use client';

import React from 'react';
import { motion, Variants } from 'motion/react';

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
            delayChildren: 0.1,
        },
    },
};

export const staggerItem: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            type: 'spring',
            stiffness: 260,
            damping: 24,
        },
    },
};

interface Props {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export default function StaggerContainer({ children, className, style }: Props) {
    return (
        <motion.div
            className={className}
            style={style}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {children}
        </motion.div>
    );
}
