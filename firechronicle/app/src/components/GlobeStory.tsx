import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface GlobeStoryProps {
  currentScene: number;
}

export const GlobeStory: React.FC<GlobeStoryProps> = ({ currentScene }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasDimensions, setHasDimensions] = useState(false);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setHasDimensions(true);
          observer.disconnect();
          break;
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasDimensions || !containerRef.current || mapRef.current) return;

    // Esri World Imagery Satellite Basemap with Reference Overlays
    const satelliteStyle: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        'esri-satellite': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: '&copy; Esri, Maxar, Earthstar Geographics'
        },
        'esri-reference': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256
        }
      },
      layers: [
        {
          id: 'esri-satellite-layer',
          type: 'raster',
          source: 'esri-satellite',
          minzoom: 0,
          maxzoom: 19
        },
        {
          id: 'esri-reference-layer',
          type: 'raster',
          source: 'esri-reference',
          minzoom: 0,
          maxzoom: 19,
          paint: {
            'raster-opacity': 0.75
          }
        }
      ]
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: satelliteStyle,
      center: [90.4125, 23.8103],
      zoom: 1.8,
      pitch: 0,
      renderWorldCopies: true,
      interactive: false,
    });

    mapRef.current = map;
    let animationFrameId: number;

    map.on('load', () => {
      // 0. Load Real Satellite Spacecraft Icon
      const satImg = new Image(64, 64);
      satImg.crossOrigin = 'anonymous';
      satImg.onload = () => {
        if (!map.hasImage('satellite-icon')) {
          map.addImage('satellite-icon', satImg);
        }
      };
      satImg.src = '/assets/satellite.svg';

      // Bangladesh High-Resolution National Boundary Overlay
      map.addSource('bgd-boundary', {
        type: 'geojson',
        data: '/BGD_boundary.geojson'
      });

      map.addLayer({
        id: 'bgd-boundary-glow',
        type: 'line',
        source: 'bgd-boundary',
        paint: {
          'line-color': '#00e5ff',
          'line-width': 3.5,
          'line-opacity': 0.55,
          'line-blur': 2
        }
      });

      map.addLayer({
        id: 'bgd-boundary-line',
        type: 'line',
        source: 'bgd-boundary',
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.6,
          'line-opacity': 0.95
        }
      });

      // 1. Satellites Source & Layers
      map.addSource('satellites', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addSource('swaths', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Swath footprint polygon layer
      map.addLayer({
        id: 'swaths-layer',
        type: 'fill',
        source: 'swaths',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.16
        }
      });

      map.addLayer({
        id: 'swaths-border',
        type: 'line',
        source: 'swaths',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.2,
          'line-dasharray': [3, 2]
        }
      });

      // Pulsing radar / sensor beacon halo beneath satellite
      map.addLayer({
        id: 'satellites-radar',
        type: 'circle',
        source: 'satellites',
        paint: {
          'circle-radius': 13,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.25,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-opacity': 0.8
        }
      });

      // Small glowing center pip
      map.addLayer({
        id: 'satellites-pip',
        type: 'circle',
        source: 'satellites',
        paint: {
          'circle-radius': 3.5,
          'circle-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': ['get', 'color']
        }
      });

      // Real Satellite Spacecraft Icon Layer
      map.addLayer({
        id: 'satellites-icon',
        type: 'symbol',
        source: 'satellites',
        layout: {
          'icon-image': 'satellite-icon',
          'icon-size': 0.72,
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });

      // Satellite Telemetry Label Layer
      map.addLayer({
        id: 'satellites-labels',
        type: 'symbol',
        source: 'satellites',
        layout: {
          'text-field': ['get', 'name'],
          'text-variable-anchor': ['bottom', 'top', 'left', 'right'],
          'text-radial-offset': 1.8,
          'text-size': 11,
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(10, 14, 20, 0.95)',
          'text-halo-width': 2.5
        }
      });

      // 2. Scene 2 Demo Cell (1km square in Gazipur/Dhaka division)
      map.addSource('demo-cell', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [90.38, 24.00],
              [90.39, 24.00],
              [90.39, 24.01],
              [90.38, 24.01],
              [90.38, 24.00]
            ]]
          },
          properties: {}
        }
      });

      map.addLayer({
        id: 'demo-cell-fill',
        type: 'fill',
        source: 'demo-cell',
        paint: {
          'fill-color': '#66fcf1',
          'fill-opacity': 0.15
        }
      });

      map.addLayer({
        id: 'demo-cell-stroke',
        type: 'line',
        source: 'demo-cell',
        paint: {
          'line-color': '#66fcf1',
          'line-width': 2
        }
      });

      const startTime = Date.now();
      const satsConfig = [
        { name: 'Terra (MODIS)', color: '#ff9800', widthDeg: 12, speed: 0.08, offset: 0 },
        { name: 'Aqua (MODIS)', color: '#ffb74d', widthDeg: 12, speed: 0.075, offset: 1.2 },
        { name: 'S-NPP (VIIRS)', color: '#f44336', widthDeg: 16, speed: 0.07, offset: 2.4 },
        { name: 'NOAA-20 (VIIRS)', color: '#66fcf1', widthDeg: 16, speed: 0.068, offset: 3.6 },
        { name: 'NOAA-21 (VIIRS)', color: '#45a29e', widthDeg: 16, speed: 0.065, offset: 4.8 },
      ];

      const animate = () => {
        if (!map.getSource('satellites') || !map.getSource('swaths')) return;
        const time = (Date.now() - startTime) / 1000;

        const satFeatures: any[] = [];
        const swathFeatures: any[] = [];

        satsConfig.forEach((sat, idx) => {
          const lon = ((time * sat.speed * 15 + idx * 72) % 360) - 180;
          const lat = Math.sin(time * 0.15 + sat.offset) * 55;

          const nextLon = (((time + 0.1) * sat.speed * 15 + idx * 72) % 360) - 180;
          const nextLat = Math.sin((time + 0.1) * 0.15 + sat.offset) * 55;
          const dLon = nextLon - lon;
          const dLat = nextLat - lat;
          const bearing = (Math.atan2(dLon, dLat) * 180) / Math.PI;

          satFeatures.push({
            type: 'Feature',
            properties: {
              name: sat.name,
              color: sat.color,
              bearing: bearing,
              label: `🛰️ ${sat.name}`
            },
            geometry: { type: 'Point', coordinates: [lon, lat] }
          });

          // Swath footprint polygon
          const w = sat.widthDeg;
          swathFeatures.push({
            type: 'Feature',
            properties: { color: sat.color },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [lon - w / 2, lat - 8],
                [lon + w / 2, lat - 8],
                [lon + w / 2, lat + 8],
                [lon - w / 2, lat + 8],
                [lon - w / 2, lat - 8]
              ]]
            }
          });
        });

        (map.getSource('satellites') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: satFeatures
        });

        (map.getSource('swaths') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: swathFeatures
        });

        animationFrameId = requestAnimationFrame(animate);
      };

      animate();
    });

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      map.remove();
      mapRef.current = null;
    };
  }, [hasDimensions]);

  // Smooth camera transitions across scenes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (currentScene === 1) {
      map.flyTo({ center: [90.4125, 23.8103], zoom: 1.8, pitch: 0, bearing: 0, duration: 2200 });
    } else if (currentScene === 2) {
      map.flyTo({ center: [90.385, 24.005], zoom: 11.5, pitch: 45, bearing: 20, duration: 2500 });
    } else if (currentScene === 3) {
      map.flyTo({ center: [90.4125, 23.8103], zoom: 6.2, pitch: 15, bearing: -10, duration: 2200 });
    } else if (currentScene === 4) {
      map.flyTo({ center: [90.4125, 23.8103], zoom: 5.5, pitch: 35, bearing: 0, duration: 2200 });
    }
  }, [currentScene]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#050608' }} />;
};
