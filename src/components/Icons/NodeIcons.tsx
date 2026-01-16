/**
 * NodeIcons - SVG icon components for different node types in the visualization
 * Used in both D3 visualization (ResponseNode) and Comment Rail (ResponseTile)
 */

export interface NodeIconProps {
  color: string;
  size?: number;
}

/**
 * SyncIcon - Filled circle for synchronous responses
 */
export function SyncIcon({ color, size = 14 }: NodeIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M29 16C29 18.5712 28.2376 21.0846 26.8091 23.2224C25.3807 25.3603 23.3503 27.0265 20.9749 28.0104C18.5995 28.9944 15.9856 29.2518 13.4638 28.7502C10.9421 28.2486 8.6257 27.0105 6.80762 25.1924C4.98953 23.3743 3.75141 21.0579 3.2498 18.5362C2.74819 16.0144 3.00563 13.4006 3.98957 11.0251C4.97351 8.64968 6.63975 6.61935 8.77759 5.1909C10.9154 3.76244 13.4288 3 16 3C19.4465 3.0043 22.7506 4.37532 25.1876 6.81236C27.6247 9.2494 28.9957 12.5535 29 16Z"
        fill={color}
      />
    </svg>
  );
}

/**
 * AsyncAudioIcon - Circle with inner fill and outer outline for asynchronous audio responses
 */
export function AsyncAudioIcon({ color, size = 14 }: NodeIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#clip0_534_477)">
        <circle cx="16" cy="16" r="12" fill="#F6F6F2"/>
        <path
          d="M16 2.5C13.33 2.5 10.7199 3.29176 8.49981 4.77516C6.27974 6.25856 4.54942 8.36697 3.52763 10.8338C2.50585 13.3006 2.2385 16.015 2.7594 18.6337C3.28031 21.2525 4.56606 23.6579 6.45406 25.5459C8.34207 27.434 10.7475 28.7197 13.3663 29.2406C15.985 29.7615 18.6994 29.4942 21.1662 28.4724C23.633 27.4506 25.7414 25.7203 27.2248 23.5002C28.7082 21.2801 29.5 18.67 29.5 16C29.496 12.4208 28.0724 8.98932 25.5416 6.45844C23.0107 3.92756 19.5792 2.50397 16 2.5ZM16 26.5C13.9233 26.5 11.8932 25.8842 10.1665 24.7304C8.4398 23.5767 7.09399 21.9368 6.29927 20.0182C5.50455 18.0996 5.29662 15.9884 5.70176 13.9516C6.10691 11.9148 7.10693 10.0438 8.57538 8.57538C10.0438 7.10693 11.9148 6.1069 13.9516 5.70175C15.9884 5.29661 18.0996 5.50454 20.0182 6.29926C21.9368 7.09399 23.5767 8.4398 24.7304 10.1665C25.8842 11.8932 26.5 13.9233 26.5 16C26.497 18.7839 25.3898 21.4528 23.4213 23.4213C21.4529 25.3898 18.7839 26.497 16 26.5Z"
          fill={color}
        />
      </g>
      <defs>
        <clipPath id="clip0_534_477">
          <rect width="32" height="32" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  );
}

/**
 * AsyncTextIcon - Diamond/rotated square with inner fill and outer outline for asynchronous text responses
 */
export function AsyncTextIcon({ color, size = 14 }: NodeIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="15.8995"
        y="4"
        width="17.7488"
        height="17.7488"
        transform="rotate(45 15.8995 4)"
        fill="#F6F6F2"
      />
      <path
        d="M29.77 14.2361L17.7625 2.22858C17.294 1.76257 16.6601 1.50098 15.9993 1.50098C15.3386 1.50098 14.7047 1.76257 14.2362 2.22858L2.23622 14.2361C1.76983 14.7046 1.508 15.3388 1.508 15.9998C1.508 16.6609 1.76983 17.2951 2.23622 17.7636L14.2425 29.7711C14.7109 30.2371 15.3448 30.4987 16.0056 30.4987C16.6664 30.4987 17.3003 30.2371 17.7687 29.7711L29.7687 17.7636C30.2351 17.2951 30.4969 16.6609 30.4969 15.9998C30.4969 15.3388 30.2351 14.7046 29.7687 14.2361H29.77ZM16 27.2911L4.70997 15.9998L16 4.70858L27.29 15.9998L16 27.2911Z"
        fill={color}
      />
    </svg>
  );
}
