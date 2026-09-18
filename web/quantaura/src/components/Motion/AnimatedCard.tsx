'use client';

import React from 'react';
import { motion } from 'motion/react';
import { staggerItem } from './StaggerContainer';

interface Props {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    hoverLift?: boolean;
    delay?: number;
    onClick?: () => void;
}

export default function AnimatedCard({
    children,
    className = 'card',
    style,
    hoverLift = true,
    delay = 0,
    onClick,
}: Props) {
    return (
        <motion.div
            className={className}
            style={style}
            variants={staggerItem}
            whileHover={
                hoverLift
                    ? {
                        y: -4,
                        transition: { type: 'spring', stiffness: 400, damping: 25 },
                    }
                    : undefined
            }
            whileTap={onClick ? { scale: 0.985 } : undefined}
            onClick={onClick}
        >
            {children}
        </motion.div>
    );
}
