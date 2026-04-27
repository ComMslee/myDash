import BottomNavV2 from './components/BottomNavV2';
import { RankingsSheetProvider } from './components/RankingsSheet';

export default function V2Layout({ children }) {
  return (
    <RankingsSheetProvider>
      {children}
      <BottomNavV2 />
    </RankingsSheetProvider>
  );
}
