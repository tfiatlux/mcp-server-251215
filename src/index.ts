import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InferenceClient } from '@huggingface/inference'
import { z } from 'zod'

// Smithery 설정 스키마 - 사용자 구성 옵션 정의
export const configSchema = z.object({
    hfToken: z
        .string()
        .optional()
        .describe('Hugging Face API 토큰 (이미지 생성 기능 사용 시 필요)')
})

// Smithery 배포를 위한 createServer 함수 export
export default function createServer({ config }: { config: z.infer<typeof configSchema> }) {
    // Create server instance
    const server = new McpServer({
        name: 'my-mcp-server',
        version: '1.0.0'
    })

    server.registerTool(
        'greet',
        {
            description: '이름과 언어를 입력하면 인사말을 반환합니다.',
            inputSchema: z.object({
                name: z.string().describe('인사할 사람의 이름'),
                language: z
                    .enum(['ko', 'en'])
                    .optional()
                    .default('en')
                    .describe('인사 언어 (기본값: en)')
            }),
            outputSchema: z.object({
                content: z
                    .array(
                        z.object({
                            type: z.literal('text'),
                            text: z.string().describe('인사말')
                        })
                    )
                    .describe('인사말')
            })
        },
        async ({ name, language }) => {
            const greeting =
                language === 'ko'
                    ? `안녕하세요, ${name}님!`
                    : `Hey there, ${name}! 👋 Nice to meet you!`

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: greeting
                    }
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text: greeting
                        }
                    ]
                }
            }
        }
    )

    server.registerTool(
        'calculator',
        {
            description: '두 개의 숫자와 연산자를 입력받아 사칙연산 결과를 반환합니다.',
            inputSchema: z.object({
                num1: z.number().describe('첫 번째 숫자'),
                num2: z.number().describe('두 번째 숫자'),
                operator: z
                    .enum(['+', '-', '*', '/'])
                    .describe('연산자 (+, -, *, /)')
            }),
            outputSchema: z.object({
                content: z
                    .array(
                        z.object({
                            type: z.literal('text'),
                            text: z.string().describe('계산 결과')
                        })
                    )
                    .describe('계산 결과')
            })
        },
        async ({ num1, num2, operator }) => {
            let result: number

            switch (operator) {
                case '+':
                    result = num1 + num2
                    break
                case '-':
                    result = num1 - num2
                    break
                case '*':
                    result = num1 * num2
                    break
                case '/':
                    if (num2 === 0) {
                        throw new Error('0으로 나눌 수 없습니다.')
                    }
                    result = num1 / num2
                    break
                default:
                    throw new Error('지원하지 않는 연산자입니다.')
            }

            const resultText = `${num1} ${operator} ${num2} = ${result}`

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: resultText
                    }
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ]
                }
            }
        }
    )

    server.registerTool(
        'getTime',
        {
            description: 'Timezone을 입력받아 해당 시간대의 현재 시간을 반환합니다.',
            inputSchema: z.object({
                timezone: z
                    .string()
                    .describe('시간대 (예: Asia/Seoul, America/New_York, Europe/London, UTC 등 IANA Timezone 형식)')
            }),
            outputSchema: z.object({
                content: z
                    .array(
                        z.object({
                            type: z.literal('text'),
                            text: z.string().describe('현재 시간')
                        })
                    )
                    .describe('현재 시간')
            })
        },
        async ({ timezone }) => {
            try {
                const now = new Date()
                const formatter = new Intl.DateTimeFormat('ko-KR', {
                    timeZone: timezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                })

                const formattedTime = formatter.format(now)
                const timeText = `Timezone: ${timezone}\n현재 시간: ${formattedTime}`

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: timeText
                        }
                    ],
                    structuredContent: {
                        content: [
                            {
                                type: 'text' as const,
                                text: timeText
                            }
                        ]
                    }
                }
            } catch (error) {
                throw new Error(`유효하지 않은 timezone입니다: ${timezone}. IANA Timezone 형식을 사용해주세요 (예: Asia/Seoul, America/New_York).`)
            }
        }
    )

    server.registerTool(
        'geocode',
        {
            description: '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다. Nominatim OpenStreetMap API를 사용합니다.',
            inputSchema: z.object({
                address: z
                    .string()
                    .describe('검색할 도시 이름이나 주소 (예: "서울", "New York", "1600 Amphitheatre Parkway, Mountain View, CA")'),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(10)
                    .optional()
                    .default(1)
                    .describe('반환할 결과의 최대 개수 (1-10, 기본값: 1)'),
                country: z
                    .string()
                    .optional()
                    .describe('국가 코드로 검색 결과 제한 (ISO 3166-1 alpha-2 형식, 예: "KR", "US", "JP")')
            }),
            outputSchema: z.object({
                content: z
                    .array(
                        z.object({
                            type: z.literal('text'),
                            text: z.string().describe('위도와 경도 좌표 정보')
                        })
                    )
                    .describe('위도와 경도 좌표 정보')
            })
        },
        async ({ address, limit = 1, country }) => {
            try {
                // Nominatim API 엔드포인트
                const baseUrl = 'https://nominatim.openstreetmap.org/search'
                const params = new URLSearchParams({
                    q: address,
                    format: 'json',
                    limit: limit.toString(),
                    addressdetails: '1'
                })

                // 국가 코드 필터 추가 (제공된 경우)
                if (country) {
                    params.append('countrycodes', country.toLowerCase())
                }

                const url = `${baseUrl}?${params.toString()}`
                
                // User-Agent 헤더는 Nominatim 사용 정책에 따라 필수입니다
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'MCP-Geocode-Tool/1.0',
                        'Accept': 'application/json'
                    }
                })

                if (!response.ok) {
                    throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`)
                }

                const data = await response.json()

                if (!Array.isArray(data) || data.length === 0) {
                    const countryMsg = country ? ` (국가: ${country})` : ''
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `주소 "${address}"${countryMsg}에 대한 검색 결과를 찾을 수 없습니다.`
                            }
                        ],
                        structuredContent: {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: `주소 "${address}"${countryMsg}에 대한 검색 결과를 찾을 수 없습니다.`
                                }
                            ]
                        }
                    }
                }

                // 결과 포맷팅
                const results = data.map((result: any, index: number) => {
                    const lat = parseFloat(result.lat)
                    const lon = parseFloat(result.lon)
                    const displayName = result.display_name || address
                    const importance = result.importance ? parseFloat(result.importance).toFixed(4) : 'N/A'
                    const countryCode = result.address?.country_code?.toUpperCase() || 'N/A'
                    
                    let resultText = `결과 ${index + 1}:\n주소: ${displayName}\n위도: ${lat}\n경도: ${lon}\n국가 코드: ${countryCode}\n중요도: ${importance}`
                    
                    // 추가 주소 정보가 있으면 포함
                    if (result.address) {
                        const addr = result.address
                        const details: string[] = []
                        if (addr.city || addr.town || addr.village) details.push(`도시: ${addr.city || addr.town || addr.village}`)
                        if (addr.state) details.push(`주/도: ${addr.state}`)
                        if (addr.postcode) details.push(`우편번호: ${addr.postcode}`)
                        if (details.length > 0) {
                            resultText += `\n${details.join(', ')}`
                        }
                    }
                    
                    return resultText
                }).join('\n\n')

                const countryInfo = country ? ` (국가 필터: ${country})` : ''
                const resultText = `검색어: "${address}"${countryInfo}\n\n${results}`

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ],
                    structuredContent: {
                        content: [
                            {
                                type: 'text' as const,
                                text: resultText
                            }
                        ]
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
                throw new Error(`Geocoding 오류: ${errorMessage}`)
            }
        }
    )

    server.registerTool(
        'get-weather',
        {
            description: '위도와 경도 좌표, 예보 기간을 입력받아 해당 위치의 현재 날씨와 예보 정보를 제공합니다. Open-Meteo Weather API를 사용합니다.',
            inputSchema: z.object({
                latitude: z
                    .number()
                    .min(-90)
                    .max(90)
                    .describe('위도 좌표 (-90 ~ 90)'),
                longitude: z
                    .number()
                    .min(-180)
                    .max(180)
                    .describe('경도 좌표 (-180 ~ 180)'),
                forecast_days: z
                    .number()
                    .int()
                    .min(1)
                    .max(16)
                    .optional()
                    .default(7)
                    .describe('예보 일수 (1-16일, 기본값: 7일)'),
                timezone: z
                    .string()
                    .optional()
                    .describe('시간대 (예: Asia/Seoul, America/New_York, Europe/London, UTC 등 IANA Timezone 형식, 기본값: 자동)')
            }),
            outputSchema: z.object({
                content: z
                    .array(
                        z.object({
                            type: z.literal('text'),
                            text: z.string().describe('날씨 정보')
                        })
                    )
                    .describe('날씨 정보')
            })
        },
        async ({ latitude, longitude, forecast_days = 7, timezone }) => {
            try {
                // Open-Meteo API 엔드포인트
                const baseUrl = 'https://api.open-meteo.com/v1/forecast'
                const params = new URLSearchParams({
                    latitude: latitude.toString(),
                    longitude: longitude.toString(),
                    forecast_days: forecast_days.toString(),
                    current_weather: 'true',
                    hourly: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code',
                    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max'
                })

                // 시간대가 제공된 경우 추가
                if (timezone) {
                    params.append('timezone', timezone)
                }

                const url = `${baseUrl}?${params.toString()}`
                
                const response = await fetch(url, {
                    headers: {
                        'Accept': 'application/json'
                    }
                })

                if (!response.ok) {
                    throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`)
                }

                const data = await response.json()

                if (data.error) {
                    throw new Error(`API 오류: ${data.reason || '알 수 없는 오류'}`)
                }

                // 현재 날씨 정보 포맷팅
                let resultText = `📍 위치: 위도 ${latitude}, 경도 ${longitude}\n`
                if (data.timezone) {
                    resultText += `🌍 시간대: ${data.timezone}\n`
                }
                if (data.elevation !== undefined) {
                    resultText += `⛰️  고도: ${data.elevation}m\n`
                }
                resultText += '\n'

                // 현재 날씨
                if (data.current_weather) {
                    const current = data.current_weather
                    const weatherDesc = getWeatherDescription(current.weather_code)
                    resultText += `🌤️  현재 날씨\n`
                    resultText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
                    resultText += `온도: ${current.temperature}°C\n`
                    resultText += `날씨: ${weatherDesc} (코드: ${current.weather_code})\n`
                    resultText += `풍속: ${current.wind_speed} km/h\n`
                    resultText += `풍향: ${current.wind_direction}°\n`
                    resultText += `시간: ${current.time}\n`
                    resultText += '\n'
                }

                // 일별 예보
                if (data.daily && data.daily.time) {
                    resultText += `📅 ${forecast_days}일 일별 예보\n`
                    resultText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
                    
                    const days = data.daily.time.length
                    for (let i = 0; i < Math.min(days, forecast_days); i++) {
                        const date = new Date(data.daily.time[i])
                        const dateStr = date.toLocaleDateString('ko-KR', { 
                            month: 'long', 
                            day: 'numeric',
                            weekday: 'short'
                        })
                        
                        const maxTemp = data.daily.temperature_2m_max?.[i]
                        const minTemp = data.daily.temperature_2m_min?.[i]
                        const precip = data.daily.precipitation_sum?.[i]
                        const weatherCode = data.daily.weather_code?.[i]
                        const windSpeed = data.daily.wind_speed_10m_max?.[i]
                        
                        const weatherDesc = weatherCode !== undefined ? getWeatherDescription(weatherCode) : 'N/A'
                        
                        resultText += `${dateStr}\n`
                        if (maxTemp !== undefined && minTemp !== undefined) {
                            resultText += `  🌡️  기온: ${minTemp}°C ~ ${maxTemp}°C\n`
                        }
                        if (weatherCode !== undefined) {
                            resultText += `  ☁️  날씨: ${weatherDesc}\n`
                        }
                        if (precip !== undefined) {
                            resultText += `  🌧️  강수량: ${precip}mm\n`
                        }
                        if (windSpeed !== undefined) {
                            resultText += `  💨 최대 풍속: ${windSpeed} km/h\n`
                        }
                        resultText += '\n'
                    }
                }

                // 시간별 예보 (다음 24시간)
                if (data.hourly && data.hourly.time) {
                    resultText += `⏰ 다음 24시간 시간별 예보\n`
                    resultText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
                    
                    const hourlyCount = Math.min(24, data.hourly.time.length)
                    for (let i = 0; i < hourlyCount; i++) {
                        const time = new Date(data.hourly.time[i])
                        const timeStr = time.toLocaleString('ko-KR', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })
                        
                        const temp = data.hourly.temperature_2m?.[i]
                        const humidity = data.hourly.relative_humidity_2m?.[i]
                        const precip = data.hourly.precipitation?.[i]
                        const windSpeed = data.hourly.wind_speed_10m?.[i]
                        const windDir = data.hourly.wind_direction_10m?.[i]
                        const weatherCode = data.hourly.weather_code?.[i]
                        
                        resultText += `${timeStr}\n`
                        if (temp !== undefined) {
                            resultText += `  🌡️  ${temp}°C`
                        }
                        if (humidity !== undefined) {
                            resultText += ` | 💧 습도: ${humidity}%`
                        }
                        if (precip !== undefined && precip > 0) {
                            resultText += ` | 🌧️  강수: ${precip}mm`
                        }
                        if (windSpeed !== undefined) {
                            resultText += ` | 💨 풍속: ${windSpeed} km/h`
                        }
                        if (windDir !== undefined) {
                            resultText += ` (${windDir}°)`
                        }
                        if (weatherCode !== undefined) {
                            resultText += ` | ${getWeatherDescription(weatherCode)}`
                        }
                        resultText += '\n'
                    }
                }

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ],
                    structuredContent: {
                        content: [
                            {
                                type: 'text' as const,
                                text: resultText
                            }
                        ]
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
                throw new Error(`날씨 정보 조회 오류: ${errorMessage}`)
            }
        }
    )

    // 서버 정보 및 사용 가능한 도구 정보를 반환하는 리소스
    server.registerResource(
        'server-info',
        new ResourceTemplate('server://info', { list: undefined }),
        {
            title: '서버 정보',
            description: '현재 MCP 서버의 정보와 사용 가능한 도구 목록을 반환합니다.'
        },
        async () => {
            const serverInfo = {
                server: {
                    name:'my-mcp-server',
                    version: '1.0.0',
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString(),
                    nodeVersion: process.version,
                    platform: process.platform
                },
                tools: [
                    {
                        name: 'greet',
                        description: '이름과 언어를 입력하면 인사말을 반환합니다.',
                        parameters: {
                            name: '인사할 사람의 이름 (필수)',
                            language: '인사 언어 (선택, 기본값: en, 옵션: ko, en)'
                        }
                    },
                    {
                        name: 'calculator',
                        description: '두 개의 숫자와 연산자를 입력받아 사칙연산 결과를 반환합니다.',
                        parameters: {
                            num1: '첫 번째 숫자 (필수)',
                            num2: '두 번째 숫자 (필수)',
                            operator: '연산자 (필수, 옵션: +, -, *, /)'
                        }
                    },
                    {
                        name: 'getTime',
                        description: 'Timezone을 입력받아 해당 시간대의 현재 시간을 반환합니다.',
                        parameters: {
                            timezone: '시간대 (필수, 예: Asia/Seoul, America/New_York, Europe/London, UTC 등 IANA Timezone 형식)'
                        }
                    },
                    {
                        name: 'geocode',
                        description: '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다. Nominatim OpenStreetMap API를 사용합니다.',
                        parameters: {
                            address: '검색할 도시 이름이나 주소 (필수)',
                            limit: '반환할 결과의 최대 개수 (선택, 기본값: 1, 범위: 1-10)',
                            country: '국가 코드로 검색 결과 제한 (선택, ISO 3166-1 alpha-2 형식, 예: KR, US, JP)'
                        }
                    },
                    {
                        name: 'get-weather',
                        description: '위도와 경도 좌표, 예보 기간을 입력받아 해당 위치의 현재 날씨와 예보 정보를 제공합니다. Open-Meteo Weather API를 사용합니다.',
                        parameters: {
                            latitude: '위도 좌표 (필수, 범위: -90 ~ 90)',
                            longitude: '경도 좌표 (필수, 범위: -180 ~ 180)',
                            forecast_days: '예보 일수 (선택, 기본값: 7일, 범위: 1-16일)',
                            timezone: '시간대 (선택, 예: Asia/Seoul, America/New_York, Europe/London, UTC 등 IANA Timezone 형식, 기본값: 자동)'
                        }
                    },
                    {
                        name: 'generate-image',
                        description: '텍스트 프롬프트를 입력받아 AI 이미지를 생성합니다. FLUX.1-schnell 모델을 사용합니다.',
                        parameters: {
                            prompt: '이미지 생성을 위한 텍스트 프롬프트 (필수)'
                        }
                    }
                ],
                resources: [
                    {
                        name: 'server-info',
                        uri: 'server://info',
                        description: '현재 MCP 서버의 정보와 사용 가능한 도구 목록을 반환합니다.'
                    }
                ]
            }

            return {
                contents: [
                    {
                        uri: 'server://info',
                        mimeType: 'application/json',
                        text: JSON.stringify(serverInfo, null, 2)
                    }
                ]
            }
        }
    )

    // 코드 리뷰 프롬프트 템플릿
    const CODE_REVIEW_PROMPT_TEMPLATE = `다음 코드를 리뷰해주세요. 다음 항목들을 중심으로 검토해주세요:

1. **코드 품질 및 가독성**
   - 코드가 명확하고 이해하기 쉬운가요?
   - 변수명과 함수명이 의미를 잘 전달하나요?
   - 주석이 적절하게 작성되어 있나요?

2. **성능 및 최적화**
   - 불필요한 연산이나 중복 코드가 있나요?
   - 알고리즘의 시간 복잡도와 공간 복잡도는 적절한가요?
   - 더 효율적인 방법이 있을까요?

3. **보안 및 에러 처리**
   - 보안 취약점이 있나요?
   - 예외 상황에 대한 처리가 적절한가요?
   - 입력값 검증이 충분한가요?

4. **모범 사례 및 표준 준수**
   - 해당 언어/프레임워크의 모범 사례를 따르고 있나요?
   - 코딩 컨벤션을 준수하고 있나요?
   - 설계 패턴이 적절하게 적용되었나요?

5. **테스트 가능성**
   - 코드가 테스트하기 쉬운 구조인가요?
   - 단위 테스트를 작성하기에 적합한가요?

6. **개선 제안**
   - 리팩토링이 필요한 부분이 있나요?
   - 구체적인 개선 방안을 제시해주세요.

---

**리뷰할 코드:**

\`\`\`
{code}
\`\`\`

---

위 항목들을 바탕으로 상세한 코드 리뷰를 작성해주세요.`

    // 코드 리뷰 프롬프트 인자 스키마 정의
    const codeReviewArgsSchema = {
        code: z
            .string()
            .describe('리뷰할 코드 (전체 코드 또는 코드 일부)'),
        language: z
            .string()
            .optional()
            .describe('코드 언어 (예: TypeScript, JavaScript, Python, Java 등)'),
        context: z
            .string()
            .optional()
            .describe('코드의 맥락이나 목적에 대한 추가 설명 (선택사항)')
    }

    // 코드 리뷰 MCP Prompt 등록
    server.registerPrompt(
        'code-review',
        {
            title: '코드 리뷰',
            description: '코드를 입력받아 상세한 코드 리뷰를 위한 프롬프트를 생성합니다. 코드 품질, 성능, 보안, 모범 사례 등을 검토합니다.',
            argsSchema: codeReviewArgsSchema
        },
        ({ code, language, context }) => {
            // 언어 정보가 제공된 경우 템플릿에 추가
            let prompt = CODE_REVIEW_PROMPT_TEMPLATE.replace('{code}', code)
            
            // 언어 정보 추가
            if (language) {
                prompt = prompt.replace(
                    '**리뷰할 코드:**',
                    `**프로그래밍 언어:** ${language}\n\n**리뷰할 코드:**`
                )
            }
            
            // 맥락 정보 추가
            if (context) {
                prompt = prompt.replace(
                    '**리뷰할 코드:**',
                    `**코드 맥락/목적:**\n${context}\n\n**리뷰할 코드:**`
                )
            }
            
            return {
                messages: [
                    {
                        role: 'user' as const,
                        content: {
                            type: 'text' as const,
                            text: prompt
                        }
                    }
                ]
            }
        }
    )

    // Hugging Face Inference Client 초기화 (config에서 토큰 사용)
    const hfClient = new InferenceClient(config?.hfToken || process.env.HF_TOKEN)

    // 이미지 생성 MCP Tool
    server.registerTool(
        'generate-image',
        {
            description: '텍스트 프롬프트를 입력받아 AI 이미지를 생성합니다. FLUX.1-schnell 모델을 사용합니다.',
            inputSchema: z.object({
                prompt: z
                    .string()
                    .describe('이미지 생성을 위한 텍스트 프롬프트 (예: "Astronaut riding a horse", "A beautiful sunset over mountains")')
            })
        },
        async ({ prompt }) => {
            try {
                // Hugging Face API를 사용하여 이미지 생성
                const imageResult = await hfClient.textToImage({
                    provider: 'auto',
                    model: 'black-forest-labs/FLUX.1-schnell',
                    inputs: prompt,
                    parameters: { num_inference_steps: 5 }
                }) as unknown as Blob

                // Blob을 Base64로 변환
                const arrayBuffer = await imageResult.arrayBuffer()
                const base64Data = Buffer.from(arrayBuffer).toString('base64')

                return {
                    content: [
                        {
                            type: 'image' as const,
                            data: base64Data,
                            mimeType: 'image/png'
                        }
                    ]
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
                throw new Error(`이미지 생성 오류: ${errorMessage}. HF_TOKEN 환경 변수가 설정되어 있는지 확인해주세요.`)
            }
        }
    )

    // Smithery는 server.server 객체를 반환해야 함
    return server.server
}

// WMO Weather Code를 날씨 설명으로 변환하는 헬퍼 함수
function getWeatherDescription(code: number): string {
    const weatherCodes: Record<number, string> = {
        0: '☀️ 맑음',
        1: '🌤️ 대체로 맑음',
        2: '⛅ 부분적으로 흐림',
        3: '☁️ 흐림',
        45: '🌫️ 안개',
        48: '🌫️ 서리 안개',
        51: '🌦️ 약한 이슬비',
        53: '🌦️ 보통 이슬비',
        55: '🌦️ 강한 이슬비',
        56: '🌨️ 약한 진눈깨비',
        57: '🌨️ 강한 진눈깨비',
        61: '🌧️ 약한 비',
        63: '🌧️ 보통 비',
        65: '🌧️ 강한 비',
        66: '🌨️ 약한 진눈깨비',
        67: '🌨️ 강한 진눈깨비',
        71: '❄️ 약한 눈',
        73: '❄️ 보통 눈',
        75: '❄️ 강한 눈',
        77: '❄️ 눈알갱이',
        80: '🌦️ 약한 소나기',
        81: '🌦️ 보통 소나기',
        82: '🌦️ 강한 소나기',
        85: '🌨️ 약한 눈 소나기',
        86: '🌨️ 강한 눈 소나기',
        95: '⛈️ 천둥번개',
        96: '⛈️ 우박과 함께 천둥번개',
        99: '⛈️ 강한 우박과 함께 천둥번개'
    }
    return weatherCodes[code] || `날씨 코드: ${code}`
}
