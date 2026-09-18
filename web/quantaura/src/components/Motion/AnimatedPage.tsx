'use client';

import React from 'react';
import { motion } from 'motion/react';

interface Props {
    children: React.ReactNode;
    className?: string;
}

export default function AnimatedPage({ children, className }: Props) {
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
            {children}
        </motion.div>
    );
}
