/**
 * telegramService.ts
 * Real-Time Autonomous Telegram Emergency Alert Dispatcher for BengalFlare.
 * Dispatches live satellite wildfire threat warnings to the official Telegram Bot & Channel.
 */

import { classifyFireOrigin } from './fireClassifier';

export interface TelegramDispatchParams {
  hotspotId: string;
  district: string;
  locationName: string;
  latitude: number;
  longitude: number;
  frpMw: number;
  satellite: string;
  fdiScore: number;
  dangerClass: string;
  windSpeedKmh: number;
  windDirection: string;
  temperatureC: number;
  humidityPct: number;
  fuelMoisturePct?: number;
  spreadRateKmh?: number;
  threatenedSettlement?: string;
  timeToImpactHours?: number;
}

export interface TelegramDispatchResult {
  success: boolean;
  timestamp: string;
  dispatchedTargets: string[];
  errors: string[];
}

const DEFAULT_BOT_TOKEN = '9096332555:AAGyQfnFNyet_2Zjt3hvkS7AoOxqpBS8AVs';
const DEFAULT_TARGETS = ['5408879423', '@bengalflare_live'];
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes anti-spam cooldown per fire

export const getTelegramToken = (): string => {
  if (typeof window === 'undefined') return DEFAULT_BOT_TOKEN;
  return localStorage.getItem('bengalflare_telegram_token') || DEFAULT_BOT_TOKEN;
};

export const isAlertDispatched = (hotspotId: string): boolean => {
  if (typeof window === 'undefined') return false;
  const lastTime = localStorage.getItem(`bengalflare_tg_dispatched_${hotspotId}`);
  if (!lastTime) return false;
  const elapsed = Date.now() - parseInt(lastTime, 10);
  return elapsed < COOLDOWN_MS;
};

export const markAlertDispatched = (hotspotId: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`bengalflare_tg_dispatched_${hotspotId}`, Date.now().toString());
  }
};

/**
 * Dispatches high-priority formatted wildfire warnings to Telegram.
 */
export async function dispatchTelegramAlert(
  params: TelegramDispatchParams,
  force: boolean = false
): Promise<TelegramDispatchResult> {
  const result: TelegramDispatchResult = {
    success: false,
    timestamp: new Date().toISOString(),
    dispatchedTargets: [],
    errors: []
  };

  // Anti-spam deduplication check
  if (!force && isAlertDispatched(params.hotspotId)) {
    result.errors.push(`Alert for ${params.hotspotId} already sent within cooldown period.`);
    return result;
  }

  const token = getTelegramToken();
  const origin = classifyFireOrigin(params.latitude, params.longitude, params.frpMw, params.humidityPct);

  const dangerEmoji = params.dangerClass === 'Extreme' ? '🔴' :
                      params.dangerClass === 'Very High' ? '🟠' :
                      params.dangerClass === 'High' ? '🔥' : '⚠️';

  const lines = [
    `🚨 *BENGALFLARE WILDFIRE EARLY WARNING*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `${dangerEmoji} *Threat Level:* ${params.dangerClass.toUpperCase()} (ELEVATED SPREAD RISK)`,
    `🔥 *FDI Fire Danger Score:* ${params.fdiScore.toFixed(1)} / 100 · ${params.frpMw.toFixed(1)} MW Heat`,
    `🏷️ *Fire Type:* ${origin.typeLabel}`,
    `🧠 *Origin Attribution:* ${Math.round(origin.humanMadeProbability * 100)}% Human-Made (${origin.landCoverContext})`,
    `🌾 *Cause / Context:* ${origin.primaryDriver}`,
    `📍 *Location:* ${params.locationName} (${params.district})`,
    `🌐 *Coordinates:* ${params.latitude.toFixed(4)}°N, ${params.longitude.toFixed(4)}°E`,
    `💨 *Wind Telemetry:* ${params.windSpeedKmh.toFixed(1)} km/h (${params.windDirection})`,
    `🌡️ *Atmosphere:* ${params.temperatureC.toFixed(1)}°C · ${params.humidityPct.toFixed(0)}% RH`
  ];

  if (params.fuelMoisturePct !== undefined) {
    const moistureDesc = params.fuelMoisturePct <= 8 ? 'Tinder Dry' : 'Moderate Moisture';
    lines.push(`🌿 *Vegetation Dryness:* ${params.fuelMoisturePct.toFixed(1)}% (${moistureDesc})`);
  }

  if (params.spreadRateKmh !== undefined) {
    lines.push(`⏱️ *Forward Spread Speed:* ~${params.spreadRateKmh.toFixed(2)} km/h downwind`);
  }

  if (params.threatenedSettlement && params.timeToImpactHours !== undefined) {
    lines.push(`🏘️ *Downwind Settlement in Path:* ${params.threatenedSettlement} (ETA: ~${params.timeToImpactHours.toFixed(1)} hrs)`);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🛰️ *NASA FIRMS Sensor:* ${params.satellite}`);
  lines.push(`🔗 *Inspect Threat Cone Live:* https://bengalflare.vercel.app/early-warning`);

  const messageText = lines.join('\n');

  // Broadcast to all configured targets (personal chat + public channel)
  const sendPromises = DEFAULT_TARGETS.map(async (target) => {
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: target,
          text: messageText,
          parse_mode: 'Markdown'
        })
      });

      const data = await res.json();
      if (data.ok) {
        result.dispatchedTargets.push(target);
      } else {
        result.errors.push(`Target ${target} failed: ${data.description || 'Unknown error'}`);
      }
    } catch (err: any) {
      result.errors.push(`Target ${target} network error: ${err.message || String(err)}`);
    }
  });

  await Promise.all(sendPromises);

  if (result.dispatchedTargets.length > 0) {
    result.success = true;
    markAlertDispatched(params.hotspotId);
  }

  return result;
}

