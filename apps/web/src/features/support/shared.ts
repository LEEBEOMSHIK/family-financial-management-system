import type { components } from '../../generated/api';
export type Issue = components['schemas']['IssueItem'];
export type IssueList = components['schemas']['IssueList'];
export type Pin = components['schemas']['Pin'];
export const statusLabels = {received:'접수',investigating:'확인 중',needs_info:'추가 확인 필요',resolved:'해결'};
export const dateLabel = (value:string) => new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date(value));
