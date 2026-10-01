export interface Panorama {
    id: number;
    region_id: number;
    slug: string;
    title: string;
    image: string;
    thumb?: string | null;
    initial_yaw: number;
    initial_pitch: number;
    sort: number;
}

export interface Region {
    id: number;
    name: string;
    slug: string;
    description: string;
    lore: string;
    x: number; // harita pikseli (8192 x 7192)
    y: number;
    type?: string;
    image?: string;
    panoramas?: Panorama[];
}

export interface MapPoint {
    x: number;
    y: number;
}
