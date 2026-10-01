import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const directoryPath = path.join(process.cwd(), 'public/dayim');
        
        // Ensure directory exists
        if (!fs.existsSync(directoryPath)) {
            return NextResponse.json([]);
        }

        const files = fs.readdirSync(directoryPath);
        
        // Filter for any common image/gif/video/asset format
        const assetFiles = files.filter(file => 
            /\.(png|jpe?g|gif|webp|avif|mp4|mov|webm|svg|bmp|tiff)$/i.test(file)
        );

        return NextResponse.json(assetFiles);
    } catch (error) {
        console.error('Easter Egg API Error:', error);
        return NextResponse.json({ error: 'Failed to list assets' }, { status: 500 });
    }
}
