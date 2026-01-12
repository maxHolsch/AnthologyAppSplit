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
      <circle cx="16" cy="16" r="12" fill="#F6F6F2"/>
      <path
        d="M16 3C13.4288 3 10.9154 3.76244 8.77759 5.1909C6.63975 6.61935 4.97351 8.64968 3.98957 11.0251C3.00563 13.4006 2.74819 16.0144 3.2498 18.5362C3.75141 21.0579 4.98953 23.3743 6.80762 25.1924C8.6257 27.0105 10.9421 28.2486 13.4638 28.7502C15.9856 29.2518 18.5995 28.9944 20.9749 28.0104C23.3503 27.0265 25.3807 25.3603 26.8091 23.2224C28.2376 21.0846 29 18.5712 29 16C28.9964 12.5533 27.6256 9.24882 25.1884 6.81163C22.7512 4.37445 19.4467 3.00364 16 3ZM16 27C13.8244 27 11.6977 26.3549 9.88873 25.1462C8.07979 23.9375 6.66989 22.2195 5.83733 20.2095C5.00477 18.1995 4.78693 15.9878 5.21137 13.854C5.63581 11.7202 6.68345 9.7602 8.22183 8.22183C9.76021 6.68345 11.7202 5.6358 13.854 5.21136C15.9878 4.78692 18.1995 5.00476 20.2095 5.83733C22.2195 6.66989 23.9375 8.07979 25.1462 9.88873C26.3549 11.6977 27 13.8244 27 16C26.9967 18.9164 25.8367 21.7123 23.7745 23.7745C21.7123 25.8367 18.9164 26.9967 16 27Z"
        fill={color}
      />
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
        d="M29.4163 14.5901L17.41 2.58256C17.0353 2.21006 16.5284 2.00098 16 2.00098C15.4716 2.00098 14.9647 2.21006 14.59 2.58256L2.59001 14.5901C2.21751 14.9648 2.00842 15.4717 2.00842 16.0001C2.00842 16.5284 2.21751 17.0353 2.59001 17.4101L14.5963 29.4176C14.971 29.7901 15.4779 29.9991 16.0063 29.9991C16.5346 29.9991 17.0415 29.7901 17.4163 29.4176L29.4225 17.4101C29.795 17.0353 30.0041 16.5284 30.0041 16.0001C30.0041 15.4717 29.795 14.9648 29.4225 14.5901H29.4163ZM16 28.0001L4.00001 16.0001L16 4.00006L28 16.0001L16 28.0001Z"
        fill={color}
      />
    </svg>
  );
}
