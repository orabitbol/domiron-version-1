import Image from 'next/image'
import { GAME_ICONS, GameIconKey } from '@/lib/game-icons'

interface GameIconProps {
  icon: GameIconKey
  size?: number
  alt?: string
  className?: string
  style?: React.CSSProperties
}

export function GameIcon({ icon, size = 18, alt = '', className, style }: GameIconProps) {
  return (
    <Image
      src={GAME_ICONS[icon]}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{
        objectFit: 'contain',
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
