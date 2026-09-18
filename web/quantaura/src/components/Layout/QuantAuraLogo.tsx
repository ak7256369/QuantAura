import Image from 'next/image';

interface Props {
    size?: number;
    className?: string;
}

export default function QuantAuraLogo({ size = 36, className }: Props) {
    return (
        <Image
            src="/logo.png"
            alt="QuantAura logo"
            width={size}
            height={size}
            className={className}
            priority
        />
    );
}
