import BottomNavV2 from './components/BottomNavV2';
import { RankingsSheetProvider } from './components/RankingsSheet';
import { PeekSheetProvider } from './components/PeekSheet';

export default function V2Layout({ children }) {
  return (
    <RankingsSheetProvider>
      <PeekSheetProvider>
        {/* 탭 페이지 본문이 peek 시트에 가려지지 않도록 추가 padding.
            --peek-h 는 PeekSheet 가 활성 탭에 따라 publish (없으면 0). */}
        <div style={{ paddingBottom: 'var(--peek-h, 0px)' }}>
          {children}
        </div>
        <BottomNavV2 />
      </PeekSheetProvider>
    </RankingsSheetProvider>
  );
}
