export default function SettingsPage() {
  return <><h1>화면 설정</h1><section className="fl-card"><h2>편안한 화면으로 사용하세요</h2><p>상단의 ‘화면 모드’에서 시스템 설정·라이트·다크를 선택할 수 있습니다. 선택한 설정은 이 기기에 기억됩니다.</p><p className="muted">브라우저에서 저장을 제한하면 현재 화면에서만 적용됩니다.</p></section><section className="fl-card"><h2>서비스 연결 상태</h2><dl className="settings-list"><dt>API</dt><dd>로컬 FastAPI</dd><dt>자료</dt><dd>서버에서 제공하는 합성 거래</dd><dt>운영 인증·DB</dt><dd>설정 전 · 실제 데이터 사용 불가</dd><dt>은행·알림 연결</dt><dd>비활성</dd></dl></section></>;
}
