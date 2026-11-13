// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.http.MediaType;
import org.springframework.util.unit.DataSize;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Refuses request bodies of the API larger than plugged.max-request-size (env var PLUGGED_MAX_REQUEST_SIZE, default 5MB) with 413, before
 * anything reads them into memory. A body with a Content-Length is judged by it; a body without one (chunked) is read up to the limit.
 */
@Configuration
public class RequestSizeLimit {
    private static final Logger log = LoggerFactory.getLogger(RequestSizeLimit.class);

    @Bean
    public FilterRegistrationBean<LimitFilter> requestSizeLimitFilter(@Value("${plugged.max-request-size:5MB}") DataSize maximum) {
        FilterRegistrationBean<LimitFilter> registration = new FilterRegistrationBean<>(new LimitFilter(maximum.toBytes()));
        registration.addUrlPatterns("/api/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    public static class LimitFilter extends OncePerRequestFilter {
        private final long maximum;

        public LimitFilter(long maximum) {
            this.maximum = maximum;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
            long length = request.getContentLengthLong();
            if (length > maximum) {
                refuse(request, response);
                return;
            }
            if (length < 0 && hasBody(request)) {
                byte[] body = readAtMost(request.getInputStream(), maximum);
                if (body == null) {
                    refuse(request, response);
                    return;
                }
                chain.doFilter(new CachedBody(request, body), response);
                return;
            }
            chain.doFilter(request, response);
        }

        private static boolean hasBody(HttpServletRequest request) {
            String method = request.getMethod();
            return "POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method) || request.getHeader("Transfer-Encoding") != null;
        }

        /** The body, or null when it is longer than {@code maximum}. */
        private static byte[] readAtMost(InputStream in, long maximum) throws IOException {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            long total = 0;
            for (int read; (read = in.read(buffer)) != -1; ) {
                total += read;
                if (total > maximum) return null;
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        }

        private void refuse(HttpServletRequest request, HttpServletResponse response) throws IOException {
            log.warn("!!! {} {} refused: request body larger than {} bytes", request.getMethod(), request.getRequestURI(), maximum);
            response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write("{\"status\":413,\"messageKey\":\"request.tooLarge\",\"maxBytes\":" + maximum + "}");
        }
    }

    /** A request whose body was already read (up to the limit). */
    static class CachedBody extends HttpServletRequestWrapper {
        private final byte[] body;

        CachedBody(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public int getContentLength() {
            return body.length;
        }

        @Override
        public long getContentLengthLong() {
            return body.length;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream in = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override
                public int read() {
                    return in.read();
                }

                @Override
                public int read(byte[] buffer, int offset, int length) {
                    return in.read(buffer, offset, length);
                }

                @Override
                public boolean isFinished() {
                    return in.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener listener) {
                    throw new UnsupportedOperationException();
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            String encoding = getCharacterEncoding();
            Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }
    }
}
