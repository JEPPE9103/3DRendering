export interface QualitySettings {
  pointDensity: number;
  loadDistance: number;
  updateFrequency: number;
}

export type SplatStyle = 'solidFlat' | 'solidFancy';

export type PostProcessingSettings = {
  ssao: boolean;
  ssaoRadius: number;
  ssaoIntensity: number;
  bloom: boolean;
  bloomIntensity: number;
  bloomThreshold?: number;
  bloomSmoothing?: number;
  fxaa: boolean;
};

export type FormatOption = 'json';

interface ViewerControlsProps {
  onPointSizeChange: (size: number) => void;
  onQualityChange: (settings: QualitySettings) => void;
  onSplatStyleChange: (style: SplatStyle) => void;
  navigationMode: 'orbit' | 'firstPerson';
  onNavigationModeChange: (mode: 'orbit' | 'firstPerson') => void;
  onFormatChange: (format: FormatOption) => void;
  currentFormat: FormatOption;
  qualitySettings: QualitySettings;
  currentSplatStyle: SplatStyle;
  postProcessing: PostProcessingSettings;
  onPostProcessingChange: (settings: PostProcessingSettings) => void;
}

export default function ViewerControls({
  onSplatStyleChange,
  navigationMode,
  onNavigationModeChange,
  onFormatChange,
  currentFormat,
  currentSplatStyle,
  postProcessing,
  onPostProcessingChange,
}: ViewerControlsProps) {
  const handlePostEffectToggle = (key: keyof PostProcessingSettings) => {
    onPostProcessingChange({
      ...postProcessing,
      [key]: !postProcessing[key],
    });
  };

  const handlePostEffectChange = (key: keyof PostProcessingSettings, value: number) => {
    onPostProcessingChange({
      ...postProcessing,
      [key]: value,
    });
  };

  return (
    <div className="viewer-controls">
      {/* Dataset Selection */}
      <div className="control-group">
        <label>Format:</label>
        <select value={currentFormat} onChange={(e) => onFormatChange(e.target.value as FormatOption)}>
          <option value="json">JSON</option>
        </select>
      </div>

      {/* Navigation Mode */}
      <div className="control-group">
        <label>Navigation:</label>
        <select
          value={navigationMode}
          onChange={(e) => onNavigationModeChange(e.target.value as 'orbit' | 'firstPerson')}
        >
          <option value="orbit">Orbit</option>
          <option value="firstPerson">First Person</option>
        </select>
      </div>

      {/* Splat Style */}
      <div className="control-group">
        <label>Splat Style:</label>
        <select
          value={currentSplatStyle}
          onChange={(e) => onSplatStyleChange(e.target.value as SplatStyle)}
        >
          <option value="solidFlat">Solid Flat</option>
          <option value="solidFancy">Solid Fancy</option>
        </select>
      </div>

      {/* Post Processing Effects */}
      <div className="control-group">
        <label>Post Effects:</label>
        <label>
          <input
            type="checkbox"
            checked={postProcessing.ssao}
            onChange={() => handlePostEffectToggle('ssao')}
          />
          SSAO
        </label>
        <label>
          <input
            type="checkbox"
            checked={postProcessing.bloom}
            onChange={() => handlePostEffectToggle('bloom')}
          />
          Bloom
        </label>
        <label>
          <input
            type="checkbox"
            checked={postProcessing.fxaa}
            onChange={() => handlePostEffectToggle('fxaa')}
          />
          FXAA
        </label>
      </div>

      {/* SSAO Settings */}
      {postProcessing.ssao && (
        <div className="control-group">
          <label>SSAO Radius:</label>
          <input
            type="range"
            min="0.01"
            max="1.0"
            step="0.01"
            value={postProcessing.ssaoRadius}
            onChange={(e) => handlePostEffectChange('ssaoRadius', parseFloat(e.target.value))}
          />
          <span>{postProcessing.ssaoRadius.toFixed(2)}</span>

          <label>SSAO Intensity:</label>
          <input
            type="range"
            min="0"
            max="20"
            step="0.1"
            value={postProcessing.ssaoIntensity}
            onChange={(e) => handlePostEffectChange('ssaoIntensity', parseFloat(e.target.value))}
          />
          <span>{postProcessing.ssaoIntensity.toFixed(1)}</span>
        </div>
      )}

      {/* Bloom Settings */}
      {postProcessing.bloom && (
        <div className="control-group">
          <label>Bloom Intensity:</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={postProcessing.bloomIntensity}
            onChange={(e) => handlePostEffectChange('bloomIntensity', parseFloat(e.target.value))}
          />
          <span>{postProcessing.bloomIntensity.toFixed(1)}</span>

          <label>Bloom Threshold:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={postProcessing.bloomThreshold ?? 0.75}
            onChange={(e) =>
              handlePostEffectChange('bloomThreshold', parseFloat(e.target.value))
            }
          />
          <span>{(postProcessing.bloomThreshold ?? 0.75).toFixed(2)}</span>

          <label>Bloom Smoothing:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={postProcessing.bloomSmoothing ?? 0.1}
            onChange={(e) =>
              handlePostEffectChange('bloomSmoothing', parseFloat(e.target.value))
            }
          />
          <span>{(postProcessing.bloomSmoothing ?? 0.1).toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
