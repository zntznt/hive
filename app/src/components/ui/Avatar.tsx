import { HexAvatar } from './HexAvatar'
import { BugAvatar } from './BugAvatar'

// Renders a member's *own* set avatar: their photo (hex-clipped) if they
// uploaded one, otherwise their chosen bug + color. Used anywhere a real
// person shows up (attendee rows, roster, headers) - never a placeholder.
export type AvatarUser = {
  display_name: string
  avatar_kind?: 'bug' | 'photo' | null
  avatar_bug?: string | null
  avatar_color?: string | null
  avatar_photo_url?: string | null
}

export function UserAvatar({ user, size = 40, shape = 'hex' }: { user: AvatarUser; size?: number; shape?: 'hex' | 'rounded' | 'circle' }) {
  if (user.avatar_kind === 'photo' && user.avatar_photo_url) {
    return shape === 'hex' ? (
      <HexAvatar name={user.display_name} size={size} src={user.avatar_photo_url} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatar_photo_url}
        alt={user.display_name}
        className={shape === 'circle' ? 'rounded-full object-cover' : 'rounded-md object-cover'}
        style={{ width: size, height: size }}
      />
    )
  }
  return <BugAvatar bug={user.avatar_bug ?? 'bug'} color={user.avatar_color ?? '#EBA937'} size={size} shape={shape} />
}
