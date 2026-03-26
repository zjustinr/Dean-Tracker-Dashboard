declare module "react-simple-maps" {
  import { ComponentType, CSSProperties, ReactNode } from "react";

  interface ComposableMapProps {
    projection?: string;
    projectionConfig?: Record<string, any>;
    width?: number;
    height?: number;
    style?: CSSProperties;
    viewBox?: string;
    children?: ReactNode;
  }

  interface GeographiesProps {
    geography: string | Record<string, any>;
    children: (data: { geographies: any[] }) => ReactNode;
  }

  interface GeographyProps {
    geography: any;
    key?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: CSSProperties;
      hover?: CSSProperties;
      pressed?: CSSProperties;
    };
    onClick?: () => void;
  }

  interface MarkerProps {
    coordinates: [number, number];
    key?: string;
    onClick?: () => void;
    style?: CSSProperties;
    children?: ReactNode;
  }

  export const ComposableMap: ComponentType<ComposableMapProps>;
  export const Geographies: ComponentType<GeographiesProps>;
  export const Geography: ComponentType<GeographyProps>;
  export const Marker: ComponentType<MarkerProps>;
}
