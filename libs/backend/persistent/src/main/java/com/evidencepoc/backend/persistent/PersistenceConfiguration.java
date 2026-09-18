package com.evidencepoc.backend.persistent;

import com.evidencepoc.backend.domain.model.CustomerContactRecord;
import com.evidencepoc.backend.domain.model.User;
import io.github.jayclock.smartdomain.boot.EnableSmartDomainMybatis;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;

@Configuration(proxyBeanMethods = false)
@PropertySource("classpath:backend-persistence.properties")
@MapperScan("com.evidencepoc.backend.persistent.mappers")
@EnableSmartDomainMybatis(
    associationBasePackages = "com.evidencepoc.backend.persistent.associations",
    leafEntityTypes = {User.class, CustomerContactRecord.class})
public class PersistenceConfiguration {}
