import { renderLandmark } from './venueShapes';
import { LandmarkElement } from '../../types';

export const renderCustomLandmarkShape = (landmark: LandmarkElement, isSelected: boolean) =>
  renderLandmark(landmark, isSelected);
