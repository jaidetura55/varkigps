
export interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
}

export enum AppMode {
  PHOTO = 'Photo',
  VIDEO = 'Video',
  EDIT = 'Edit'
}

export interface WatermarkProps {
  time: string;
  date: string;
  day: string;
  address: string;
  isVerified?: boolean;
}
