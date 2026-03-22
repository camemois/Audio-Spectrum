# Audio-Spectrum

CapCut 편집에 바로 가져다 쓰기 좋은 오디오 스펙트럼 생성 도구입니다.
여러 WAV 파일을 넣고 순서를 조절한 뒤, 미리재생 또는 배치 렌더(WEBM 저장)할 수 있습니다.

## 핵심 기능
- WAV 다중 업로드 + 순서 변경(위/아래)
- 현재 선택 곡 미리재생 버튼
- 전체 곡 순차 재생/렌더 및 현재 진행 상황 표시
- 배경 모드: 매트릭스 블랙 / 크로마키 그린
- 형태 모드: 바 / 원형
- 색상 모드: 단일 색상 / 스펙트럼 색상
- 스펙트럼 투명도, 바 개수, 캔버스 가로/세로 크기 설정
- 레이아웃: 좌→우 / 대칭형
- 최소/최대 높이 증폭으로 강한 모션 표현
- 수면 반사 효과 on/off
- 렌더 시 곡별 WEBM 자동 저장

## 로컬 실행
1. 저장소 루트에서 `index.html`을 브라우저로 열기
2. 또는 간단 서버 실행: `python3 -m http.server 8080`
3. 브라우저에서 `http://localhost:8080` 접속

## GitHub에서 작동시키기 (GitHub Pages)
이 저장소에는 `main` 브랜치 푸시 시 자동 배포되는 워크플로우가 포함되어 있습니다.

### 1) 저장소 설정
- GitHub 저장소 `Settings` → `Pages`
- `Build and deployment`가 **GitHub Actions**로 설정되어 있는지 확인

### 2) 배포 방법
- `main` 브랜치에 푸시하면 자동으로 배포 실행
- 또는 `Actions` 탭에서 **Deploy static app to GitHub Pages**를 수동 실행

### 3) 접속 주소
- 배포 완료 후: `https://<github-username>.github.io/<repository-name>/`

## 파일
- `index.html`: UI 및 옵션 패널
- `styles.css`: 레이아웃/다크 테마
- `app.js`: 오디오 디코딩, 스펙트럼 렌더링, 순차 처리/녹화
- `.github/workflows/deploy-pages.yml`: GitHub Pages 자동 배포 워크플로우
