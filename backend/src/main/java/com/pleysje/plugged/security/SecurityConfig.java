// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import com.pleysje.plugged.repository.UserRepository;

/**
 * Who may call what. The page itself (index.html, scripts, styles) is public: it shows the first-start, sign-in and registration screens.
 * The API needs a signed-in, approved user, except
 * <ul>
 *   <li>/api/auth/** : status, first start, registration, sign in and out</li>
 *   <li>/api/info : the donate link and contact address of the Info page</li>
 * </ul>
 * /api/admin/** is for the administrator only. The session is a cookie (JSESSIONID); requests that change something carry the CSRF token of
 * the XSRF-TOKEN cookie in the X-XSRF-TOKEN header (see frontend/src/api/http.js). Without a session the API answers 401, not a redirect.
 */
@Configuration
public class SecurityConfig {
    public static final String ROLE_USER = "USER";
    public static final String ROLE_ADMIN = "ADMIN";

    /** Only in a web application (not in a run with spring.main.web-application-type=none, which has no HttpSecurity). */
    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    public SecurityFilterChain securityFilterChain(HttpSecurity http, UserService userService, SecurityContextRepository contexts) throws Exception {
        http.authorizeHttpRequests(requests -> requests
                        .requestMatchers("/api/auth/**", "/api/info").permitAll()
                        .requestMatchers("/api/admin/**").hasRole(ROLE_ADMIN)
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll())
                .csrf(csrf -> csrf.spa())
                .securityContext(context -> context.securityContextRepository(contexts))
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .addFilterAfter(new ActiveUserFilter(userService), SecurityContextHolderFilter.class)
                .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable); // POST /api/auth/logout (AuthController)
        return http.build();
    }

    /** The signed-in user lives in the HTTP session. */
    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    /** bcrypt (stored as {bcrypt}..., so the algorithm can change later without invalidating the stored passwords). */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    /**
     * The accounts as Spring Security sees them (an unapproved account is disabled). Signing in goes through {@link UserService#authenticate};
     * this bean also keeps Spring Boot from creating its default user with a generated password.
     */
    @Bean
    public UserDetailsService userDetailsService(UserRepository users) {
        return email -> users.findByEmail(UserService.normalizeEmail(email))
                .map(user -> User.withUsername(user.getEmail()).password(user.getPasswordHash()).disabled(!user.isApproved())
                        .roles(user.isAdmin() ? new String[] {ROLE_USER, ROLE_ADMIN} : new String[] {ROLE_USER}).build())
                .orElseThrow(() -> new UsernameNotFoundException(email));
    }
}
