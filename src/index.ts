import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InferenceClient } from '@huggingface/inference'
import { z } from 'zod'

// Smithery 배포를 위한 createServer 함수 export
export default function createServer() {
    // Create server instance
    const server = new McpServer({
        name: 'mcp-server-251215',
        version: '1.0.0'
    })

    server.tool(
        'greet',
        '이름과 언어를 입력하면 인사말을 반환합니다.',
        {
            name: z.string().describe('인사할 사람의 이름'),
            language: z
                .enum(['ko', 'en'])
                .optional()
                .default('en')
                .describe('인사 언어 (기본값: en)')
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
                ]
            }
        }
    )

    server.tool(
        'calculator',
        '두 개의 숫자와 연산자를 입력받아 사칙연산 결과를 반환합니다.',
        {
            num1: z.number().describe('첫 번째 숫자'),
            num2: z.number().describe('두 번째 숫자'),
            operator: z
                .enum(['+', '-', '*', '/'])
                .describe('연산자 (+, -, *, /)')
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
                        return {
                            content: [{ type: 'text' as const, text: '오류: 0으로 나눌 수 없습니다.' }],
                            isError: true
                        }
                    }
                    result = num1 / num2
                    break
                default:
                    return {
                        content: [{ type: 'text' as const, text: '오류: 지원하지 않는 연산자입니다.' }],
                        isError: true
                    }
            }

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `${num1} ${operator} ${num2} = ${result}`
                    }
                ]
            }
        }
    )

    server.tool(
        'getTime',
        'Timezone을 입력받아 해당 시간대의 현재 시간을 반환합니다.',
        {
            timezone: z
                .string()
                .describe('시간대 (예: Asia/Seoul, America/New_York, Europe/London, UTC 등 IANA Timezone 형식)')
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
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `Timezone: ${timezone}\n현재 시간: ${formattedTime}`
                        }
                    ]
                }
            } catch (error) {
                return {
                    content: [{ type: 'text' as const, text: `유효하지 않은 timezone입니다: ${timezone}` }],
                    isError: true
                }
            }
        }
    )

    server.tool(
        'geocode',
        '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다.',
        {
            address: z
                .string()
                .describe('검색할 도시 이름이나 주소'),
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
                .describe('국가 코드로 검색 결과 제한 (ISO 3166-1 alpha-2 형식)')
        },
        async ({ address, limit = 1, country }) => {
            try {
                const baseUrl = 'https://nominatim.openstreetmap.org/search'
                const params = new URLSearchParams({
                    q: address,
                    format: 'json',
                    limit: limit.toString(),
                    addressdetails: '1'
                })

                if (country) {
                    params.append('countrycodes', country.toLowerCase())
                }

                const response = await fetch(`${baseUrl}?${params.toString()}`, {
                    headers: {
                        'User-Agent': 'MCP-Geocode-Tool/1.0',
                        'Accept': 'application/json'
                    }
                })

                if (!response.ok) {
                    return {
                        content: [{ type: 'text' as const, text: `API 요청 실패: ${response.status}` }],
                        isError: true
                    }
                }

                const data = await response.json()

                if (!Array.isArray(data) || data.length === 0) {
                    return {
                        content: [{ type: 'text' as const, text: `주소 "${address}"에 대한 검색 결과가 없습니다.` }]
                    }
                }

                const results = data.map((result: any, index: number) => {
                    return `결과 ${index + 1}:\n주소: ${result.display_name}\n위도: ${result.lat}\n경도: ${result.lon}`
                }).join('\n\n')

                return {
                    content: [{ type: 'text' as const, text: `검색어: "${address}"\n\n${results}` }]
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
                return {
                    content: [{ type: 'text' as const, text: `Geocoding 오류: ${errorMessage}` }],
                    isError: true
                }
            }
        }
    )

    server.tool(
        'get-weather',
        '위도와 경도 좌표를 입력받아 현재 날씨와 예보 정보를 제공합니다.',
        {
            latitude: z.number().min(-90).max(90).describe('위도 좌표 (-90 ~ 90)'),
            longitude: z.number().min(-180).max(180).describe('경도 좌표 (-180 ~ 180)'),
            forecast_days: z.number().int().min(1).max(16).optional().default(7).describe('예보 일수 (1-16일)')
        },
        async ({ latitude, longitude, forecast_days = 7 }) => {
            try {
                const baseUrl = 'https://api.open-meteo.com/v1/forecast'
                const params = new URLSearchParams({
                    latitude: latitude.toString(),
                    longitude: longitude.toString(),
                    forecast_days: forecast_days.toString(),
                    current_weather: 'true',
                    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code'
                })

                const response = await fetch(`${baseUrl}?${params.toString()}`)

                if (!response.ok) {
                    return {
                        content: [{ type: 'text' as const, text: `API 요청 실패: ${response.status}` }],
                        isError: true
                    }
                }

                const data = await response.json()

                let resultText = `📍 위치: 위도 ${latitude}, 경도 ${longitude}\n\n`

                if (data.current_weather) {
                    const current = data.current_weather
                    resultText += `🌤️ 현재 날씨\n`
                    resultText += `온도: ${current.temperature}°C\n`
                    resultText += `풍속: ${current.wind_speed} km/h\n\n`
                }

                if (data.daily && data.daily.time) {
                    resultText += `📅 ${forecast_days}일 예보\n`
                    for (let i = 0; i < Math.min(data.daily.time.length, forecast_days); i++) {
                        const date = data.daily.time[i]
                        const maxTemp = data.daily.temperature_2m_max?.[i]
                        const minTemp = data.daily.temperature_2m_min?.[i]
                        resultText += `${date}: ${minTemp}°C ~ ${maxTemp}°C\n`
                    }
                }

                return {
                    content: [{ type: 'text' as const, text: resultText }]
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
                return {
                    content: [{ type: 'text' as const, text: `날씨 조회 오류: ${errorMessage}` }],
                    isError: true
                }
            }
        }
    )

    server.tool(
        'generate-image',
        '텍스트 프롬프트를 입력받아 AI 이미지를 생성합니다. (HF_TOKEN 환경변수 필요)',
        {
            prompt: z.string().describe('이미지 생성을 위한 텍스트 프롬프트')
        },
        async ({ prompt }) => {
            try {
                const hfToken = process.env.HF_TOKEN
                if (!hfToken) {
                    return {
                        content: [{ type: 'text' as const, text: 'HF_TOKEN 환경 변수가 설정되지 않았습니다.' }],
                        isError: true
                    }
                }

                const hfClient = new InferenceClient(hfToken)
                const imageResult = await hfClient.textToImage({
                    provider: 'hf-inference',
                    model: 'black-forest-labs/FLUX.1-schnell',
                    inputs: prompt,
                    parameters: { num_inference_steps: 5 }
                }) as unknown as Blob

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
                const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
                return {
                    content: [{ type: 'text' as const, text: `이미지 생성 오류: ${errorMessage}` }],
                    isError: true
                }
            }
        }
    )

    return server
}
